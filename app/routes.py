import gridfs
from bson.objectid import ObjectId
from flask import Blueprint, render_template, request, redirect, url_for, flash, current_app, make_response
from flask_login import login_required, current_user
from werkzeug.utils import secure_filename
from .models import Item, User 

bp = Blueprint('main', __name__)

@bp.route('/')
def index():
    # 根據 URL 參數決定當前角色 (預設為 'user')
    role = request.args.get('role', 'user') 
    
    default_tab = 'items' if role == 'seller' else 'exchange'
    active_tab = request.args.get('tab', default_tab)

    tab_info = {
        'exchange': {'title': '物品交換', 'description': '瀏覽可交換的物品，點擊查看詳情'},
        'buy_sell': {'title': '買賣專區', 'description': '瀏覽待售物品，點擊「有興趣」聯繫賣家'},
        'rent': {'title': '租借專區', 'description': '瀏覽可租借物品，點擊「有興趣」聯繫出借者'},
        'items': {'title': '我的物品', 'description': '管理您的物品清單'},
        'responses': {'title': '管理回應', 'description': '查看買家或交換者的回應'},
        'profile': {'title': '個人資料', 'description': '管理您的個人資訊與聯絡方式'}
    }

    # --- 資料撈取邏輯 ---
    items_to_show = []     # 存放要顯示的商品列表
    seller_map = {}        # 存放 {seller_id: User物件} 的對照表

    db = current_app.db

    # 情況 A: 賣家看自己的物品
    if role == 'seller' and active_tab == 'items' and current_user.is_authenticated:
        items_to_show = Item.get_by_seller(current_user.id, db)
    
    # 情況 B: 一般用戶瀏覽公共區域 (交換/買賣/租借)
    elif role == 'user' and active_tab in ['exchange', 'buy_sell', 'rent']:
        # 對應 tab 名稱到資料庫的 transaction_type
        type_map = {
            'exchange': 'exchange',
            'buy_sell': 'sell',
            'rent': 'rent'
        }
        t_type = type_map.get(active_tab)
        if t_type:
            items_to_show = Item.get_all(t_type, db)
            
            # 收集這些商品的賣家 ID 並查詢賣家資料
            seller_ids = list(set([item.seller_id for item in items_to_show]))
            for sid in seller_ids:
                user_data = db.users.find_one({"_id": ObjectId(sid)})
                if user_data:
                    seller_map[sid] = User(user_data)

    current_tab_info = tab_info.get(active_tab, {})
    
    # 統一使用 items 變數傳遞
    return render_template('index.html', 
                           role=role, 
                           active_tab=active_tab, 
                           title=current_tab_info.get('title'), 
                           description=current_tab_info.get('description'),
                           items=items_to_show,  
                           seller_map=seller_map)
# [新增] 處理個人資料更新的路由
@bp.route('/profile/update', methods=['POST'])
@login_required
def update_profile():
    # 從表單獲取資料
    line_id = request.form.get('line_id')
    phone = request.form.get('phone')
    facebook = request.form.get('facebook')
    
    # 更新資料庫 (需確保 models.py 中的 User 類別已有 update_contact_info 方法)
    # 注意：這裡需要 current_app 才能存取到 db
    current_user.update_contact_info(line_id, phone, facebook, current_app.db)
    
    flash('個人資料已更新成功！', 'success')
    
    # 保持原本的角色狀態重導回 profile 分頁
    role = request.args.get('role', 'user')
    return redirect(url_for('main.index', role=role, tab='profile'))


# [新增] 檢查上傳檔案副檔名
def allowed_file(filename):
    ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg', 'gif'}
    return '.' in filename and \
           filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS


# [新增] 上傳商品路由 (包含 GridFS 圖片儲存)
@bp.route('/items/upload', methods=['GET', 'POST'])
@login_required
def upload_item():
    if request.method == 'POST':
        # 1. 檢查是否有圖片
        if 'image' not in request.files:
            flash('未上傳圖片', 'danger')
            return redirect(request.url)
        
        file = request.files['image']
        
        if file and file.filename != '':
            if allowed_file(file.filename):
                # --- 使用 GridFS 儲存圖片 ---
                # 初始化 GridFS
                fs = gridfs.GridFS(current_app.db)
                # 將檔案寫入 MongoDB，並取得 file_id
                file_id = fs.put(file, filename=secure_filename(file.filename), content_type=file.mimetype)
                
                # 2. 取得表單文字資料
                name = request.form.get('name')
                description = request.form.get('description')
                tags_str = request.form.get('tags')
                # 將逗號分隔的字串轉為列表
                tags = [t.strip() for t in tags_str.split(',')] if tags_str else []
                
                transaction_type = request.form.get('transaction_type')
                price = request.form.get('price')
                exchange_want = request.form.get('exchange_want')

                # 3. 準備資料庫文件
                item_doc = {
                    "seller_id": current_user.id, # 關聯到當前登入者
                    "name": name,
                    "description": description,
                    "image_id": file_id,          # 儲存 MongoDB 的 file_id
                    "tags": tags,
                    "transaction_type": transaction_type,
                    "price": int(price) if price else None,
                    "exchange_want": exchange_want if transaction_type == 'exchange' else None
                }

                # 4. 呼叫 Model 建立商品
                Item.create_item(item_doc, current_app.db)
                
                flash('商品上架成功！', 'success')
                return redirect(url_for('main.index', role='seller', tab='items'))
            else:
                flash('不支援的檔案格式 (僅限 png, jpg, jpeg, gif)', 'danger')
                return redirect(request.url)
        else:
             flash('請選擇一張商品圖片', 'warning')
             return redirect(request.url)

    # GET 請求：顯示上傳表單
    return render_template('items/upload.html')


# [新增] 讀取 GridFS 圖片的路由
@bp.route('/image/<image_id>')
def get_image(image_id):
    try:
        fs = gridfs.GridFS(current_app.db)
        # 從 GridFS 讀取檔案
        grid_out = fs.get(ObjectId(image_id))
        
        # 建立回應，將圖片內容傳回瀏覽器
        response = make_response(grid_out.read())
        # 設定正確的 Content-Type (例如 image/jpeg)，讓瀏覽器知道這是圖片
        response.mimetype = grid_out.content_type
        return response
    except Exception as e:
        # 若找不到圖片或發生錯誤，回傳 404
        return "Image not found", 404

# [新增] 編輯物品路由
@bp.route('/items/edit/<item_id>', methods=['GET', 'POST'])
@login_required
def edit_item(item_id):
    db = current_app.db
    item = Item.get_by_id(item_id, db)
    
    # 安全檢查：確認物品存在，且是當前登入者的物品
    if not item or item.seller_id != current_user.id:
        flash('找不到該物品或您無權限編輯。', 'danger')
        return redirect(url_for('main.index', role='seller', tab='items'))

    if request.method == 'POST':
        # 取得表單資料
        name = request.form.get('name')
        description = request.form.get('description')
        tags_str = request.form.get('tags')
        tags = [t.strip() for t in tags_str.split(',')] if tags_str else []
        transaction_type = request.form.get('transaction_type')
        price = request.form.get('price')
        exchange_want = request.form.get('exchange_want')
        
        # 準備更新的資料
        update_data = {
            "name": name,
            "description": description,
            "tags": tags,
            "transaction_type": transaction_type,
            "price": int(price) if price else None,
            "exchange_want": exchange_want if transaction_type == 'exchange' else None
        }

        # 處理圖片更新 (如果有上傳新圖片)
        if 'image' in request.files:
            file = request.files['image']
            if file and file.filename != '' and allowed_file(file.filename):
                fs = gridfs.GridFS(db)
                # 1. 刪除舊圖
                if item.image_id:
                    try:
                        fs.delete(item.image_id)
                    except:
                        pass
                # 2. 存新圖
                file_id = fs.put(file, filename=secure_filename(file.filename), content_type=file.mimetype)
                update_data['image_id'] = file_id

        # 更新資料庫
        item.update(update_data, db)
        flash('物品已更新成功！', 'success')
        return redirect(url_for('main.index', role='seller', tab='items'))

    # GET 請求：顯示編輯頁面
    return render_template('items/edit.html', item=item)


# [新增] 刪除物品路由
@bp.route('/items/delete/<item_id>', methods=['POST'])
@login_required
def delete_item(item_id):
    db = current_app.db
    item = Item.get_by_id(item_id, db)
    
    # 安全檢查
    if not item or item.seller_id != current_user.id:
        flash('找不到該物品或您無權限刪除。', 'danger')
    else:
        item.delete(db)
        flash('物品已刪除。', 'success')
        
    return redirect(url_for('main.index', role='seller', tab='items'))