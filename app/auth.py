# 處理認證相關的路由
from flask import Blueprint, render_template, redirect, url_for, flash, request, current_app
from .models import User
from flask_login import login_user, logout_user, login_required

auth_bp = Blueprint('auth', __name__)

@auth_bp.route('/register', methods=['GET', 'POST'])
def register():
    if request.method == 'POST':
        username = request.form.get('username')
        email = request.form.get('email')
        password = request.form.get('password')
        
        db = current_app.db # 從 current_app 取得資料庫連線
        
        # 檢查 email 是否已存在
        if User.find_by_email(email, db):
            flash('此 Email 已經被註冊過了。', 'danger')
            return redirect(url_for('auth.register'))

        # 建立新使用者
        user_doc = {
            "username": username,
            "email": email
        }
        # 使用 set_password 來雜湊密碼
        temp_user = User(user_doc)
        temp_user.set_password(password)
        user_doc['password_hash'] = temp_user.password_hash

        db.users.insert_one(user_doc)

        flash('註冊成功！請登入。', 'success')
        return redirect(url_for('auth.login'))

    return render_template('auth/register.html')


@auth_bp.route('/login', methods=['GET', 'POST'])
def login():
    if request.method == 'POST':
        email = request.form.get('email')
        password = request.form.get('password')
        
        db = current_app.db
        user_data = User.find_by_email(email, db)

        if user_data:
            user = User(user_data)
            if user.check_password(password):
                login_user(user) 
                flash('登入成功！', 'success')
                return redirect(url_for('main.index'))

        flash('Email 或密碼錯誤，請重試。', 'danger')
        return redirect(url_for('auth.login'))

    return render_template('auth/login.html')

@auth_bp.route('/logout')
@login_required # 確保只有登入的使用者才能登出
def logout():
    logout_user()
    flash('您已經成功登出。', 'info')
    return redirect(url_for('main.index'))