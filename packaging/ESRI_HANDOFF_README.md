# Stormwater Packaging Tool for ArcGIS Experience Builder

This bundle is for the non-Streamlit Experience Builder deployment.

## What your coworker should do

1. Copy the handoff folder to the target server.
2. Make sure the Windows account running the API can access the synced Council OneDrive folder.
3. Install Python packages from `requirements-esri.txt`.
4. Run `start_packaging_api.bat`.
5. Open `http://<server-name>:8001/app` in a browser and confirm it loads.
6. In ArcGIS Experience Builder, add an `Embed` widget and point it to that URL.

## Important

Experience Builder does not run Python in the browser. This deployment works by:

- serving a normal HTML/JavaScript page
- running the packaging logic in Python on the server
- calling the Python API from the embedded page

So this should be deployed as a hosted web app endpoint for an `Embed` widget, not pasted into Experience Builder source files.

## SharePoint / OneDrive path

The current Council path is expected to be:

`<OneDriveCommercial>\Stormwater Engineering - General\Stormwater Tool`

On the current machine example, that becomes:

`C:\Users\mark.ocallaghan\OneDrive - Northern Beaches Council\Stormwater Engineering - General\Stormwater Tool`

The launcher now tries that automatically by using the current account's `%OneDriveCommercial%` path first.

That means the app is not tied to `mark.ocallaghan` specifically. It will work for whichever Windows account is running the API, as long as that account has the same Council OneDrive library synced.

## Folder contents needed in the synced Stormwater Tool folder

- `scripts/api.py`
- `scripts/cost_engine.py`
- `scripts/web/`
- `Data/assets_with_coords.csv` or `data/assets_with_coords.csv`
- `Data/assets.csv` or `data/assets.csv`
- `Data/Panel_Rates.xlsx` or `data/Panel_Rates.xlsx`
- `Outputs/` or `outputs/`

## Default behavior

The launcher sets:

- `PACKAGING_SHARED_ROOT` to `%OneDriveCommercial%\Stormwater Engineering - General\Stormwater Tool` when available
- otherwise it falls back to the handoff folder itself
- `PACKAGING_ALLOWED_ORIGINS` to allow common ArcGIS Experience Builder hosts

That means the app will look for:

- input files in `Data\` or `data\`
- output folder in `Outputs\` or `outputs\`

without any extra environment setup.

## What "works for every user" means here

The browser users opening Experience Builder do not each need SharePoint or OneDrive access.

Only the Windows account running the Python API on the server needs:

- read access to the synced `Stormwater Tool` folder
- write access to `Outputs`

Once the API is running, any user who can open the Experience Builder app can use the tool through their browser.

If the API is run as a dedicated server or service account, sync the Council OneDrive library for that account or set `PACKAGING_SHARED_ROOT` manually to a shared filesystem path that account can access.

## If Experience Builder is on another hostname

Edit `start_packaging_api.bat` and add the Experience Builder or Portal host to:

- `PACKAGING_ALLOWED_ORIGINS`

Example:

```bat
set PACKAGING_ALLOWED_ORIGINS=https://experience.arcgis.com,https://your-portal.example.com
```

You can also force a specific data root if the synced folder is not under `%OneDriveCommercial%`:

```bat
set PACKAGING_SHARED_ROOT=C:\Path\To\Stormwater Tool
```

## Smoke test

After starting the API, these should all work:

- `http://<server-name>:8001/health`
- `http://<server-name>:8001/packaging/config`
- `http://<server-name>:8001/app`

## ArcGIS dependency

The page loads the ArcGIS JavaScript API from:

- `https://js.arcgis.com/4.33/`

If the target environment blocks that CDN, it must be allowed.
