## 📚 Documentation & Guides

- **Comprehensive Testing Guide** — Full testing procedures
- **Where to Edit Guide** — Code organization reference
- **Chrome Extension Quick Start** — Extension setup
- **YouTube Testing Guide** — YouTube integration testing

## ✨ Features

### Chrome Extension
✅ Real-time caption monitoring (YouTube + HTML5)
✅ Customizable word filtering with preset packs
✅ Multiple action modes: mute, skip, fast-forward
✅ Per-category settings (Language, Violence, Sexual)
✅ ASR (Automatic Speech Recognition) integration
✅ Visual feedback overlay

### Backend (Separate Repo)
✅ FastAPI REST API
✅ SQLite preference storage
✅ Regex word matching with word boundaries
✅ Category-based filtering rules

### Marketing Website
✅ Responsive design
✅ Dark mode toggle
✅ Plan selection system
✅ Account management UI

## 🧪 Quick Test

1. Install the Chrome extension (see Setup)
2. Go to any YouTube video with captions
3. Enable captions (CC button)
4. Open extension → Add a common word to Language filters
5. Watch for muting when the word appears in captions

## 🤝 Contributing

This is a personal project/prototype. If you'd like to contribute:

- Check the documentation in WHERE_TO_EDIT.md for code organization
- Review COMPREHENSIVE_TESTING_GUIDE.md before making changes
- Test thoroughly with YouTube videos

## 📝 Known Issues

- Backend Python code is not included in this repository (may be in separate repo)
- Extension requires manual installation (not published to Chrome Web Store)
- ASR features require backend connection

## 📄 License
[Add your license here]

## 👤 Author
Katherine Behunin (@kthrnbeh)

## 🔗 Links
- Repository: https://github.com/kthrnbeh/ISweep_wireframe
- Documentation: See markdown files in root directory

## DEV_SETUP (Windows + VS Code)

1. Select interpreter: Ctrl+Shift+P → "Python: Select Interpreter" → choose `.venv\Scripts\python.exe` in `C:\ISweep_wireframe`.
2. Verify active Python:
	```bash
	python -c "import sys; print(sys.executable)"
	```
	Expect the path to `.venv\Scripts\python.exe` (not the Windows Store alias).
3. Use the explicit venv path for installs:
	```bash
	C:\ISweep_wireframe\.venv\Scripts\python.exe -m pip install -r requirements.txt
	```
4. Optional Windows tip: Settings → Apps → App execution aliases → turn off `python.exe` / `python3.exe` to avoid the Microsoft Store shim.

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
