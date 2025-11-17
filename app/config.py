import os
from dotenv import load_dotenv

# 載入 .env 文件中的環境變數
load_dotenv()

class Config:
    SECRET_KEY = os.environ.get('SECRET_KEY')
    MONGO_URI = os.environ.get('MONGO_URI')