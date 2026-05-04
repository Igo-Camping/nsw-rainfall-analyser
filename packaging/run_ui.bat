@echo off
echo Starting Stormwater UI...

REM Go to scripts folder
cd /d "C:\Users\fonzi\Weather App Folder\packaging\scripts"

REM Activate virtual environment
call D:\LLM\llm-env\Scripts\activate.bat

REM Run Streamlit UI
streamlit run ui.py

pause