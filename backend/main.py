from fastapi import FastAPI
from dotenv import load_dotenv

from form_analyzer import router as form_analyzer_router
from interactor import router as interactor_router


load_dotenv()

app = FastAPI()

app.include_router(form_analyzer_router)
app.include_router(interactor_router)