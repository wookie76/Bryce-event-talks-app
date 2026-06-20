import os
import time
import json
import logging
import urllib.parse
from datetime import datetime
import feedparser
import requests
from bs4 import BeautifulSoup
from flask import Flask, jsonify, render_template, request

# Set up logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

app = Flask(__name__)

FEED_URL = "https://docs.cloud.google.com/feeds/bigquery-release-notes.xml"
CACHE_FILE = "feed_cache.json"
CACHE_DURATION = 900  # 15 minutes in seconds

def get_iso_date(updated_parsed):
    """Convert feedparser updated_parsed structure to ISO-8601 string."""
    try:
        if updated_parsed:
            return time.strftime("%Y-%m-%dT%H:%M:%SZ", updated_parsed)
    except Exception:
        pass
    return datetime.utcnow().isoformat() + "Z"

def parse_release_notes():
    """Fetches and parses the BigQuery release notes XML feed."""
    logger.info(f"Fetching RSS feed from {FEED_URL}")
    
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
    }
    
    try:
        response = requests.get(FEED_URL, headers=headers, timeout=15)
        response.raise_for_status()
        feed_data = feedparser.parse(response.text)
    except Exception as e:
        logger.error(f"Error fetching feed: {str(e)}")
        # If fetch fails, we return an empty list or try to load from old cache
        if os.path.exists(CACHE_FILE):
            logger.info("Loading stale cache due to fetch error")
            with open(CACHE_FILE, 'r') as f:
                return json.load(f).get('updates', [])
        raise e

    updates = []
    
    for entry in feed_data.entries:
        date_str = getattr(entry, 'title', 'Unknown Date')
        entry_link = getattr(entry, 'link', 'https://docs.cloud.google.com/bigquery/docs/release-notes')
        iso_date = get_iso_date(getattr(entry, 'updated_parsed', None))
        
        # Get content HTML
        content_html = ""
        if hasattr(entry, 'summary'):
            content_html = entry.summary
        elif hasattr(entry, 'content') and len(entry.content) > 0:
            content_html = entry.content[0].value
            
        if not content_html:
            continue
            
        soup = BeautifulSoup(content_html, 'html.parser')
        
        # Parse items. Google release notes group updates under <h3> headers.
        current_category = "General"
        current_content = []
        entry_updates = []
        
        for child in soup.contents:
            if getattr(child, 'name', None) == 'h3':
                # Save previous category block if it has content
                if current_content:
                    html_chunk = "".join(str(c) for c in current_content).strip()
                    text_chunk = BeautifulSoup(html_chunk, 'html.parser').get_text().strip()
                    if text_chunk:
                        entry_updates.append({
                            "category": current_category,
                            "html": html_chunk,
                            "text": text_chunk
                        })
                current_category = child.get_text().strip()
                current_content = []
            else:
                current_content.append(child)
                
        # Append final block
        if current_content:
            html_chunk = "".join(str(c) for c in current_content).strip()
            text_chunk = BeautifulSoup(html_chunk, 'html.parser').get_text().strip()
            if text_chunk:
                entry_updates.append({
                    "category": current_category,
                    "html": html_chunk,
                    "text": text_chunk
                })
                
        # If we couldn't split by <h3> at all, insert the whole entry content
        if not entry_updates and content_html:
            text_chunk = soup.get_text().strip()
            if text_chunk:
                entry_updates.append({
                    "category": "General",
                    "html": content_html,
                    "text": text_chunk
                })
                
        # Add metadata and unique IDs to each parsed update
        for index, item in enumerate(entry_updates):
            # Normalise categories
            cat = item["category"].capitalize()
            # Generate unique ID based on date, category and index
            slug = f"{date_str}-{cat}-{index}".lower().replace(" ", "-").replace(",", "")
            
            updates.append({
                "id": slug,
                "date": date_str,
                "iso_date": iso_date,
                "category": cat,
                "html": item["html"],
                "text": item["text"],
                "link": entry_link
            })
            
    # Save to cache
    try:
        cache_data = {
            "timestamp": time.time(),
            "updates": updates
        }
        with open(CACHE_FILE, 'w') as f:
            json.dump(cache_data, f)
        logger.info(f"Cached {len(updates)} updates successfully")
    except Exception as e:
        logger.error(f"Error saving to cache: {str(e)}")
        
    return updates

def get_cached_updates(force_refresh=False):
    """Retrieve updates from cache or fetch new ones if expired/requested."""
    if not force_refresh and os.path.exists(CACHE_FILE):
        try:
            with open(CACHE_FILE, 'r') as f:
                cache_data = json.load(f)
            
            # Check if cache is still valid
            if time.time() - cache_data.get("timestamp", 0) < CACHE_DURATION:
                logger.info("Serving updates from cache")
                return cache_data.get("updates", []), False
        except Exception as e:
            logger.error(f"Error reading cache file: {str(e)}")
            
    # Fetch and parse new data
    updates = parse_release_notes()
    return updates, True

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/api/releases')
def get_releases():
    force_refresh = request.args.get('refresh', 'false').lower() == 'true'
    try:
        updates, fetched_new = get_cached_updates(force_refresh=force_refresh)
        return jsonify({
            "status": "success",
            "count": len(updates),
            "fetched_new": fetched_new,
            "updates": updates
        })
    except Exception as e:
        return jsonify({
            "status": "error",
            "message": f"Failed to fetch release notes: {str(e)}"
        }), 500

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=True)
