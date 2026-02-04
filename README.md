### Marketing Website Setup

You can use any static server to serve the site:

```bash
cd docs
python -m http.server 8000
```

Or use the VS Code Live Server extension for instant preview.
### Backend Setup

> **Expected structure (not in repo):**
> isweep-backend/
> ├── app/
> │   ├── main.py
> │   ├── models.py
> │   ├── database.py
> │   └── rules.py
> └── requirements.txt

**Install dependencies**

```bash
pip install -r requirements.txt
```

**Run backend**

```bash
python -m uvicorn app.main:app --port 8001 --reload
```
## 🛠️ Setup Instructions

### Chrome Extension Setup

1. **Install Extension**:
	```bash
	# Open Chrome and navigate to:
	chrome://extensions/
   
	# Enable "Developer mode" (top right)
	# Click "Load unpacked"
	# Select the `isweep-chrome-extension` folder
	```
# ISweep_wireframe
# ISweep - AI-Powered Content Filter

Smart video content filtering using AI-powered detection to mute, skip, or fast-forward unwanted content in real-time.

## 🚀 Project Overview

ISweep is a content filtering system consisting of:

- **Chrome Extension** - Real-time video filtering for YouTube and HTML5 videos
- **Backend API** - FastAPI server for preference management and decision logic
- **Marketing Website** - Static HTML/CSS/JS landing pages

## 📁 Repository Structure
