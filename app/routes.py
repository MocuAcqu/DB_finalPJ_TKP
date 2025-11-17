from flask import Blueprint, render_template, request

bp = Blueprint('main', __name__)

@bp.route('/')
def index():
    # 根據 URL 參數決定當前角色 (預設為 'user')
    role = request.args.get('role', 'user') 
    
    default_tab = 'items' if role == 'seller' else 'exchange'
    active_tab = request.args.get('tab', default_tab)

    tab_info = {
        'exchange': {
            'title': '物品交換',
            'description': '瀏覽可交換的物品，點擊查看詳情'
        },
        'buy_sell': {
            'title': '買賣專區',
            'description': '瀏覽待售物品，點擊「有興趣」聯繫賣家'
        },
        'rent': {
            'title': '租借專區',
            'description': '瀏覽可租借物品，點擊「有興趣」聯繫出借者'
        },
        'items': {
            'title': '我的物品',
            'description': '管理您的物品清單'
        }
    }

    current_tab_info = tab_info.get(active_tab, {})
    return render_template('index.html', role=role, active_tab=active_tab, title=current_tab_info.get('title'), description=current_tab_info.get('description'))