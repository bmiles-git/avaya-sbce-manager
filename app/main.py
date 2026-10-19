from fastapi import FastAPI
from fastapi.responses import HTMLResponse

from app.database import engine, Base

Base.metadata.create_all(bind=engine)

app = FastAPI(title="Avaya SBCE Manager", version="0.1.0")


@app.get("/", response_class=HTMLResponse)
async def root():
    return """
    <html>
        <head><title>Avaya SBCE Manager</title></head>
        <body>
            <h1>Avaya SBCE Manager</h1>
            <p>Scaffold is running. Core models loaded.</p>
            <p>Next: authentication, device inventory, and certificate workflows.</p>
        </body>
    </html>
    """


@app.get("/health")
async def health():
    return {"status": "ok", "service": "avaya-sbce-manager"}
