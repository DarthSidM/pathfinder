import os
from dotenv import load_dotenv

load_dotenv(dotenv_path=".env")

LLM_BASE_URL= os.getenv("LLM_BASE_URL")
LLM_API_KEY= os.getenv("LLM_API_KEY")
LLM_MODEL_NAME=os.getenv("LLM_MODEL_NAME")

print(LLM_MODEL_NAME)