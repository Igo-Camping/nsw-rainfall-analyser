@echo off
call D:\LLM\llm-env\Scripts\activate.bat
cd /d "C:\Users\fonzi\Weather App Folder\packaging\scripts"
py -m uvicorn api:app --host 0.0.0.0 --port 8001 --reload
