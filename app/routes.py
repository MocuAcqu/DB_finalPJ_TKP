# 可以拿掉array messages=[]
import gridfs
from bson.objectid import ObjectId
from flask import Blueprint, render_template, request, redirect, url_for, flash, current_app, make_response, jsonify
from flask_login import login_required, current_user
from werkzeug.utils import secure_filename
from .models import Item, User 
from datetime import datetime, timedelta
from uuid import uuid4

bp = Blueprint('main', __name__)

@bp.route('/')
def index():
    search_query = request.args.get('q', '').strip()
    sort_order = request.args.get('sort', 'desc') 
    
    # 1 為 ascending, -1 為 descending 
    sort_direction = 1 if sort_order == 'asc' else -1
    sort_logic = [("created_at", sort_direction)] # 預設按創建時間排序

    db = current_app.db
    filter_query = {} # 動態建立的 MongoDB 查詢條件

    if search_query:
        # 使用正規表達式進行不分大小寫的模糊比對
        regex_query = {"$regex": search_query, "$options": "i"}

        # 找出符合名稱的提供者/賣家 ID
        matching_sellers = db.users.find({"username": regex_query}, {"_id": 1})
        matching_seller_ids = [str(user["_id"]) for user in matching_sellers]

        # 查詢條件：名稱 OR 標籤 OR 提供者名稱
        query_conditions = [
            {"name": regex_query},
            {"tags": regex_query} 
        ]
        
        if matching_seller_ids:
            query_conditions.append({"seller_id": {"$in": matching_seller_ids}})
        
        filter_query["$or"] = query_conditions

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
    interests = []         # 存放賣家「管理回應」列表
    exchange_requests = []

    db = current_app.db

    # 情況 A: 賣家看自己的物品
    if role == 'seller' and active_tab == 'items' and current_user.is_authenticated:
        base_query = {"seller_id": current_user.id}
        final_query = {**base_query, **filter_query}
        
        item_docs = list(db.items.find(final_query).sort(sort_logic))
        items_to_show = [Item(doc) for doc in item_docs]
    
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
            base_query = {"transaction_type": t_type}
            final_query = {**base_query, **filter_query}
            
            item_docs = list(db.items.find(final_query).sort(sort_logic))
            items_to_show = [Item(doc) for doc in item_docs]
            seller_ids = list(set([item.seller_id for item in items_to_show]))

            for sid in seller_ids:
                user_data = db.users.find_one({"_id": ObjectId(sid)})
                if user_data:
                    seller_map[sid] = User(user_data)

    # 情況 C: 賣家查看「管理回應」tab（表達興趣列表）
    elif role == 'seller' and active_tab == 'responses' and current_user.is_authenticated:
        owner_oid = ObjectId(current_user.id)

        # ===== A. 既有：買賣 / 租借 表達興趣 =====
        txs = list(db.transactions.find(
            {"owner_id": owner_oid}
        ).sort("created_at", -1))

        if txs:
            item_ids = [tx["item_id"] for tx in txs if "item_id" in tx]
            buyer_ids = [tx["interested_user_id"] for tx in txs if "interested_user_id" in tx]

            items_map = {
                doc["_id"]: doc
                for doc in db.items.find({"_id": {"$in": item_ids}})
            }
            buyers_map = {
                doc["_id"]: doc
                for doc in db.users.find({"_id": {"$in": buyer_ids}})
            }

            for tx in txs:
                item_doc = items_map.get(tx["item_id"])
                buyer_doc = buyers_map.get(tx["interested_user_id"])

                interests.append({
                    "id": str(tx["_id"]), 
                    "item": item_doc,
                    "buyer": buyer_doc,
                    "type": tx.get("type") or tx.get("transaction_type"),
                    "status": tx.get("status", "pending"),
                    "created_at": tx.get("created_at"),
                })

        # ===== B. 新增：交換請求列表 (來自 exchanges) =====
        ex_docs = list(db.exchanges.find(
            {"target_item_owner_id": current_user.id}
        ).sort("created_at", -1))

        if ex_docs:
            # 目標物品 & 對方提出的物品
            target_ids = [ex["target_item_id"] for ex in ex_docs]
            proposed_ids = []
            for ex in ex_docs:
                proposed_ids.extend(ex.get("proposed_item_ids", []))

            all_item_ids = list({*target_ids, *proposed_ids})

            items_map2 = {
                doc["_id"]: doc
                for doc in db.items.find({"_id": {"$in": all_item_ids}})
            }

            # 提出者
            proposer_ids = list({ex["proposer_id"] for ex in ex_docs})
            users_map2 = {
                doc["_id"]: doc
                for doc in db.users.find({
                    "_id": {"$in": [ObjectId(uid) for uid in proposer_ids]}
                })
            }

            for ex in ex_docs:
                target_item = items_map2.get(ex["target_item_id"])
                offered_items_clean = []
                for oid in ex.get("proposed_item_ids", []):
                    item_doc = items_map2.get(oid)
                    if item_doc:
                        offered_items_clean.append({
                            "name": item_doc.get("name"),
                            "image_id": str(item_doc.get("image_id"))
                        })
                proposer = users_map2.get(ObjectId(ex["proposer_id"]))

                exchange_requests.append({
                    "id": str(ex["_id"]),
                    "target_item": target_item,
                    "target_item_id": str(target_item["_id"]) if target_item else None,
                    "offered_items": offered_items_clean,
                    "proposer": proposer,
                    "status": ex.get("status", "pending"),
                    "created_at": ex.get("created_at"),
                })
    current_tab_info = tab_info.get(active_tab, {})
    
    # 統一使用 items 變數傳遞
    return render_template('index.html', 
                           role=role, 
                           active_tab=active_tab, 
                           title=current_tab_info.get('title'), 
                           description=current_tab_info.get('description'),
                           items=items_to_show,  
                           seller_map=seller_map,
                           interests=interests,
                           exchange_requests=exchange_requests,
                           search_query=search_query,
                           sort_order=sort_order,
                           )

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

# ---------------------------------------------------
# 使用者表達興趣（建立交易紀錄）
# ---------------------------------------------------
@bp.route("/express_interest", methods=["POST"])
@login_required
def express_interest():
    data = request.get_json() or {}

    item_id = data.get("item_id")
    owner_id = data.get("owner_id")
    tx_type = data.get("transaction_type")
    item_name = data.get("item_name")

    if not item_id or not owner_id or not tx_type:
        return {"ok": False, "error": "缺少必要欄位"}, 400

    try:
        item_oid = ObjectId(item_id)
        owner_oid = ObjectId(owner_id)
        buyer_oid = ObjectId(current_user.id)
    except:
        return {"ok": False, "error": "ID 格式錯誤"}, 400

    if buyer_oid == owner_oid:
        return {"ok": False, "error": "不能對自己的物品表達興趣"}, 400

    db = current_app.db

    tx_doc = {
        "item_id": item_oid,
        "owner_id": owner_oid,
        "interested_user_id": buyer_oid,
        "transaction_type": tx_type, 
        "item_name": item_name,
        "status": "pending",
        "created_at": datetime.utcnow() + timedelta(hours=8)
    }

    db.transactions.insert_one(tx_doc)

    return {"ok": True}

@bp.route("/item/detail/<item_id>")
def item_detail(item_id):
    db = current_app.db
    item = Item.get_by_id(item_id, db)

    if not item:
        return {"error": "Item not found"}, 404

    seller = db.users.find_one({"_id": ObjectId(item.seller_id)})
    seller_name = seller.get("username") if seller else "未知"

    return {
        "name": item.name,
        "description": item.description,
        "seller": seller_name,
        "tags": item.tags,
        "image_id": str(item.image_id),
        "transaction_type": item.transaction_type,
        "price": item.price,
        "exchange_want": item.exchange_want,
    }



@bp.route("/exchange/<exchange_id>/messages")
def get_exchange_messages(exchange_id):
    db = current_app.db
    exchange = db.exchanges.find_one({"_id": ObjectId(exchange_id)})
    if not exchange:
        return jsonify({"ok": False, "error": "exchange not found"}), 404
    
    return jsonify({"ok": True, "messages": exchange.get("messages", [])})

@bp.route("/exchange/<exchange_id>/add_message", methods=["POST"])
@login_required
def add_exchange_message(exchange_id):
    db = current_app.db
    data = request.get_json()
    text = data.get("text", "").strip()

    if not text:
        return jsonify({"ok": False, "error": "empty message"}), 400

    message = {
        "message_id": str(uuid4()),
        "user_id": current_user.id,
        "username": current_user.username,
        "text": text,
        "timestamp": datetime.utcnow().isoformat()
    }

    db.exchanges.update_one(
        {"_id": ObjectId(exchange_id)},
        {"$push": {"messages": message}}
    )

    return jsonify({"ok": True, "message": message})

@bp.route("/user/my_items")
@login_required
def my_items():
    db = current_app.db
    docs = list(db.items.find({"seller_id": current_user.id}))
    return jsonify({
        "ok": True,
        "items": [
            {
                "_id": str(x["_id"]),
                "name": x["name"],
                "image_id": str(x["image_id"])
            }
            for x in docs
        ]
    })
@bp.route("/exchange/create", methods=["POST"])
@login_required
def create_exchange():
    db = current_app.db
    data = request.get_json() or {}

    target_item_id = data.get("target_item_id")
    proposed_item_ids = data.get("proposed_item_ids", [])  # 多選

    if not target_item_id or not proposed_item_ids:
        return jsonify({"ok": False, "error": "missing fields"}), 400

    try:
        target_oid = ObjectId(target_item_id)
        proposed_oids = [ObjectId(x) for x in proposed_item_ids]
    except:
        return jsonify({"ok": False, "error": "ID 格式錯誤"}), 400

    target_item = db.items.find_one({"_id": target_oid})
    if not target_item:
        return jsonify({"ok": False, "error": "target item not found"}), 404

    # 確認這些 proposed items 都是目前登入者的
    owner_id_str = str(current_user.id)
    count = db.items.count_documents({
        "_id": {"$in": proposed_oids},
        "seller_id": owner_id_str
    })
    if count != len(proposed_oids):
        return jsonify({"ok": False, "error": "有物品不是你的，不能用來交換"}), 400

    # 排序後存起來，避免組合順序不同算成不同
    proposed_oids_sorted = sorted(proposed_oids, key=lambda x: str(x))

    existing = db.exchanges.find_one({
        "target_item_id": target_oid,
        "proposer_id": owner_id_str,
        "proposed_item_ids": proposed_oids_sorted,
    })
    if existing:
        return jsonify({"ok": False, "error": "你已經用這組物品提出過交換"}), 400

    exchange_doc = {
        "target_item_id": target_oid,
        "target_item_owner_id": str(target_item["seller_id"]),
        "proposer_id": owner_id_str,
        "proposed_item_ids": proposed_oids_sorted,  # 改成 list
        "status": "pending",
        "created_at": datetime.utcnow() + timedelta(hours=8),
    }
    result = db.exchanges.insert_one(exchange_doc)
    exchange_id = str(result.inserted_id)

    return jsonify({"ok": True, "exchange_id": exchange_id})
# 取得某個商品的留言（公開）
@bp.route("/item/<item_id>/comments")
def get_item_comments(item_id):
    db = current_app.db
    try:
        item_oid = ObjectId(item_id)
    except:
        return jsonify({"ok": False, "error": "invalid item id"}), 400

    docs = list(db.item_comments.find(
        {"item_id": item_oid}
    ).sort("created_at", 1))

    return jsonify({
        "ok": True,
        "comments": [
            {
                "username": c.get("username", "未知"),
                "text": c.get("text", ""),
                "timestamp": c.get("timestamp")  # ISO string
            }
            for c in docs
        ]
    })


# 新增留言（需要登入）
@bp.route("/item/<item_id>/comments", methods=["POST"])
@login_required
def add_item_comment(item_id):
    db = current_app.db
    data = request.get_json() or {}
    text = data.get("text", "").strip()

    if not text:
        return jsonify({"ok": False, "error": "empty message"}), 400

    try:
        item_oid = ObjectId(item_id)
    except:
        return jsonify({"ok": False, "error": "invalid item id"}), 400

    comment = {
        "item_id": item_oid,
        "user_id": current_user.id,
        "username": current_user.username,
        "text": text,
        "timestamp": datetime.utcnow().isoformat()
    }

    db.item_comments.insert_one(comment)

    return jsonify({"ok": True, "comment": {
        "username": comment["username"],
        "text": comment["text"],
        "timestamp": comment["timestamp"]
    }})

@bp.route("/update_interest_status", methods=["POST"])
@login_required
def update_interest_status():
    data = request.get_json() or {}
    interest_id = data.get("interest_id")
    status = data.get("status")

    if not interest_id or not status:
        return jsonify({"ok": False, "error": "Missing fields"}), 400

    db = current_app.db

    try:
        db.transactions.update_one(
            {"_id": ObjectId(interest_id)},
            {"$set": {"status": status}}
        )
        return jsonify({"ok": True})
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 500

@bp.route("/update_exchange_status", methods=["POST"])
@login_required
def update_exchange_status():
    data = request.get_json() or {}
    exchange_id = data.get("exchange_id")
    status = data.get("status")

    if not exchange_id or not status:
        return jsonify({"ok": False, "error": "Missing required fields"}), 400

    db = current_app.db
    
    try:
        oid = ObjectId(exchange_id)
    except Exception:
        return jsonify({"ok": False, "error": "Invalid exchange ID format"}), 400

    # 安全檢查：確保是這筆交換的擁有者 (target_item_owner) 才能更新狀態
    result = db.exchanges.update_one(
        {
            "_id": oid,
            "target_item_owner_id": current_user.id
        },
        {"$set": {"status": status}}
    )

    # 檢查是否有文件被成功更新
    if result.matched_count == 0:
        return jsonify({"ok": False, "error": "Exchange not found or permission denied"}), 404
    
    return jsonify({"ok": True})