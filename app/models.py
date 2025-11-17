# 建立使用者模型與資料庫連線
from flask_login import UserMixin
from werkzeug.security import generate_password_hash, check_password_hash
from bson.objectid import ObjectId
from datetime import datetime
import gridfs

class User(UserMixin):
    def __init__(self, user_data):
        self.id = str(user_data.get('_id'))
        self.username = user_data.get('username')
        self.email = user_data.get('email')
        self.password_hash = user_data.get('password_hash')
        
        # [新增] 初始化聯絡資訊，若資料庫沒有則預設為空字串
        self.line_id = user_data.get('line_id', '')
        self.phone = user_data.get('phone', '')
        self.facebook = user_data.get('facebook', '')

    def set_password(self, password):
        self.password_hash = generate_password_hash(password)

    def check_password(self, password):
        return check_password_hash(self.password_hash, password)

    # [新增] 更新聯絡資訊的方法
    def update_contact_info(self, line_id, phone, facebook, db):
        # 1. 更新資料庫
        db.users.update_one(
            {"_id": ObjectId(self.id)},
            {"$set": {
                "line_id": line_id,
                "phone": phone,
                "facebook": facebook
            }}
        )
        # 2. 更新當前物件屬性 (讓頁面不用重整也能顯示新資料)
        self.line_id = line_id
        self.phone = phone
        self.facebook = facebook

    @staticmethod
    def get(user_id, db):
        user_data = db.users.find_one({"_id": ObjectId(user_id)})
        if user_data:
            return User(user_data)
        return None
    
    @staticmethod
    def find_by_email(email, db):
        return db.users.find_one({"email": email})

#----------------------------------------------
# [修改] 商品模型：改為儲存 image_id
class Item:
    def __init__(self, item_data):
        self.id = str(item_data.get('_id'))
        self.seller_id = item_data.get('seller_id')
        self.name = item_data.get('name')
        self.description = item_data.get('description')
        
        # [修改] 這裡改存 GridFS 的檔案 ID
        self.image_id = item_data.get('image_id') 
        
        self.tags = item_data.get('tags', [])
        self.transaction_type = item_data.get('transaction_type')
        self.price = item_data.get('price')
        self.exchange_want = item_data.get('exchange_want')
        self.created_at = item_data.get('created_at', datetime.utcnow())

    @staticmethod
    def create_item(data, db):
        data['created_at'] = datetime.utcnow()
        result = db.items.insert_one(data)
        data['_id'] = result.inserted_id
        return Item(data)

    @staticmethod
    def get_by_seller(seller_id, db):
        items = db.items.find({"seller_id": seller_id}).sort("created_at", -1)
        return [Item(item) for item in items]
    @staticmethod
    def get_all(transaction_type, db):
        # 根據交易類型 (sell, rent, exchange) 撈取所有商品，並按時間倒序排列
        items = db.items.find({"transaction_type": transaction_type}).sort("created_at", -1)
        return [Item(item) for item in items]

    # [新增] 透過 ID 取得單一物品
    @staticmethod
    def get_by_id(item_id, db):
        try:
            item_data = db.items.find_one({"_id": ObjectId(item_id)})
            if item_data:
                return Item(item_data)
            return None
        except:
            return None

    # [新增] 更新物品
    def update(self, data, db):
        # 更新資料庫
        db.items.update_one(
            {"_id": ObjectId(self.id)},
            {"$set": data}
        )
        # 更新當前物件屬性 (非必要，但在某些情境下有用)
        for key, value in data.items():
            setattr(self, key, value)

    # [新增] 刪除物品
    def delete(self, db):
        # 1. 如果有圖片，先從 GridFS 刪除
        if self.image_id:
            fs = gridfs.GridFS(db)
            try:
                fs.delete(self.image_id)
            except:
                pass # 忽略圖片刪除錯誤（例如圖片早已不見）
        
        # 2. 從 items 集合刪除文件
        db.items.delete_one({"_id": ObjectId(self.id)})
    
    # 為了在前端顯示賣家名稱，我們可能需要一個 helper
    @property
    def seller_info(self):
        # 這只是一個屬性佔位符，實際資料需要在 route 處理時填入，
        # 或者在 template 中透過 seller_id 查詢 (比較複雜)，
        # 簡單做法是在 route 把 seller 物件一併查出來傳給 template。
        pass