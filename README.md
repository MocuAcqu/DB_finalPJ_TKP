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

# 啟動方式
```
.\venv\Scripts\activate
```
