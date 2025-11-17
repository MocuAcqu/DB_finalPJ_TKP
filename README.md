# 夥伴共編方式
```
# Clone 倉庫到本地
git clone https://github.com/MocuAcqu/DB_finalPJ_TKP.git
cd DB_finalPJ_TKP
```
```
# 先轉移到 main，同步 main 分支
git switch main
git pull origin main
```
```
# 創建並切換到你的新分支
# ex: git checkout -b feature/environment_setup
git checkout -b <新分支名字>
```
```
# 拉取了最新的程式碼後，只需執行以下命令即可安裝所有必要的套件
pip install -r requirements.txt
```

```
# 若完成開發要 push
git add .
git commit -m "這裡放留言(ex: 登入功能完成)"
```
```
# ex: git push -u origin feature/environment_setup
git push -u origin <分支名字>
```
接著在 github 會有 pull requests 的相關確認，可以做到這一步的時候敲我一下，或是要直接就 merge 上去也可以。

# 啟動方式
```
.\venv\Scripts\activate
python app.py
```
# 資料結構
```
├── app/
│   ├── __init__.py         
│   ├── static/             # 存放 CSS, JS, 圖片等靜態檔案
│   │   └── css/
│   │       └── style.css
│   ├── templates/          # 存放 HTML 模板
│   │   ├── layouts/
│   │   │   └── base.html       # 基礎模板 
│   │   ├── partials/      
│   │   │   └── _header.html    # 導航欄
│   │   ├── auth/
│   │   │   ├── register.html      
│   │   │   └── login.html      
│   │   └── index.html          # 主頁面
│   ├── routes.py           # 存放所有路由 (URL 對應的處理函式)
│   ├── models.py           
│   ├── auth.py           
│   └── config.py           # 載入環境變數的設定檔
│
├── .env                    # (本地) 存放環境變數，不上傳 Git
├── .env.example            # 環境變數範本檔(給大家知道要設定哪些環境變數)
├── .gitignore
├── app.py                  
└── requirements.txt       
```
# ERD
<img src="https://github.com/MocuAcqu/DB_finalPJ_TKP/blob/main/readme_img/ERD1.png" width="500">
