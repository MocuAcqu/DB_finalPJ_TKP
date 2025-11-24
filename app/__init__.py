from flask import Flask
from .config import Config
from flask_login import LoginManager
from pymongo import MongoClient
from .models import User

# 初始化 LoginManager
login_manager = LoginManager()
# 設定如果未登入，會被重導向到哪個頁面
login_manager.login_view = 'auth.login'

# user_loader 是一個回呼函式，Flask-Login 用它來從 session 中儲存的 user_id 重新載入使用者物件
@login_manager.user_loader
def load_user(user_id):
    # 這裡我們需要能夠存取 db 連線
    # 正確的做法是在 create_app 中將 db 附加到 app 上
    from flask import current_app
    return User.get(user_id, current_app.db)


def create_app():
    app = Flask(__name__)
    app.config.from_object(Config)

    # --- 資料庫連線設定 ---
    client = MongoClient(app.config['MONGO_URI'])
    app.db = client["tkp_db"]  # 將 db 物件附加到 app 上
    
    # 初始化 Flask-Login
    login_manager.init_app(app)

    # 註冊主路由 Blueprint
    from . import routes
    app.register_blueprint(routes.bp)

    # 註冊認證路由 Blueprint
    from . import auth
    app.register_blueprint(auth.auth_bp)

    return app