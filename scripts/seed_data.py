"""Create clearly marked, synthetic campus data only for the new isolated database."""
import base64
import hashlib
import secrets
from datetime import datetime, timedelta, timezone
from decimal import Decimal

WINDOWS = [
    (1, '一食堂', '烟火小炒', '一食堂 1F · 03 号窗口', '热锅现炒的家常味道，让每一顿都有烟火气。', 12),
    (2, '二食堂', '轻食计划', '二食堂 1F · 08 号窗口', '新鲜蔬果和优质蛋白，吃得清爽，也吃得满足。', 10),
    (3, '一食堂', '麦香面馆', '一食堂 2F · 06 号窗口', '一碗热汤、一份手作面点，熨帖忙碌的一天。', 12),
]
# 菜价、营养和库存均为本地演示资料，热量不能作为真实营养检测结果。
DISHES = [
    (1, 1, 1, '照烧鸡腿饭', '16.80', 48, 685, '招牌推荐,高蛋白', 'chicken.jpg', '嫩烤鸡腿配时蔬与米饭，浓郁照烧汁带来刚刚好的满足。'),
    (2, 1, 1, '番茄牛腩饭', '18.80', 32, 720, '慢炖入味,人气之选', 'beef.jpg', '酸甜番茄慢炖牛腩，汤汁拌饭正合适。'),
    (3, 1, 1, '宫保鸡丁饭', '14.80', 45, 645, '微辣,经典家常', 'chicken.jpg', '鸡丁、花生和时蔬一起翻炒，香而不燥。'),
    (4, 1, 1, '香菇滑鸡饭', '13.80', 40, 598, '清淡鲜香,现做', 'rice.jpg', '香菇和嫩鸡肉的鲜味，配一碗热腾腾的米饭。'),
    (5, 1, 2, '蒜蓉时蔬', '6.00', 36, 115, '清爽时蔬,素食可选', 'salad.jpg', '当季绿叶菜清炒，留住鲜甜的口感。'),
    (6, 1, 4, '紫菜蛋花汤', '3.50', 50, 62, '暖心热汤,少油', 'soup.jpg', '紫菜和蛋花的清鲜，为一餐添一点温暖。'),
    (7, 2, 2, '牛油果鸡胸沙拉', '19.80', 25, 425, '高蛋白,清爽轻食', 'salad.jpg', '鸡胸肉、牛油果与新鲜蔬菜，搭配清爽油醋汁。'),
    (8, 2, 2, '南瓜杂粮能量碗', '16.00', 30, 468, '膳食纤维,素食可选', 'rice.jpg', '烤南瓜、杂粮和蔬菜，把一碗饭吃得丰富一点。'),
    (9, 2, 2, '香煎鸡胸低脂餐', '18.00', 32, 505, '少油少盐,高蛋白', 'chicken.jpg', '香煎鸡胸搭配粗粮和时蔬，适合轻负担的一餐。'),
    (10, 2, 4, '鲜橙饮', '6.00', 40, 96, '清爽解腻,不加糖', 'orange.jpg', '清爽果香，为忙碌的午后补充一点好心情。'),
    (11, 3, 3, '红烧牛肉面', '16.00', 35, 628, '暖心热汤,招牌推荐', 'noodles.jpg', '浓汤、牛肉和劲道面条，一碗吃出踏实的幸福感。'),
    (12, 3, 3, '鲜肉小馄饨', '10.00', 40, 386, '手作面点,清淡鲜香', 'soup.jpg', '鲜肉馄饨落入清汤，热乎乎的一碗刚刚好。'),
    (13, 3, 3, '葱油拌面', '9.00', 45, 485, '经典风味,少量微甜', 'noodles.jpg', '葱油与酱汁裹住每一根面条，简单也有好味道。'),
    (14, 3, 3, '鲜香蒸饺', '8.00', 36, 360, '手作面点,早餐优选', 'rice.jpg', '一份热气腾腾的蒸饺，装下朴实的鲜香。'),
]

def quote(value):
    if value is None:
        return 'NULL'
    if isinstance(value, (int, Decimal)):
        return str(value)
    return "'" + str(value).replace('\\', '\\\\').replace("'", "''") + "'"

def password_hash(password):
    salt = secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac('sha256', password.encode(), salt, 210000)
    return '210000$' + base64.b64encode(salt).decode() + '$' + base64.b64encode(digest).decode()

def seed_sql():
    now = datetime.now(timezone(timedelta(hours=8))).replace(tzinfo=None)
    out = ['-- 所有账号、菜谱和历史订单为本地演示数据，不对应真实学生和交易。']
    for row in WINDOWS:
        out.append('INSERT INTO campus_window(id,canteen_name,name,location,description,capacity,opening_hours,enabled) VALUES (' + ','.join(map(quote, row)) + ", '07:00–09:00 / 11:00–13:20 / 17:00–19:20',1);")
    for cid, name in enumerate(['人气主食', '清爽轻食', '面点小吃', '暖心汤饮'], 1):
        out.append(f'INSERT INTO category(id,type,name,sort,status,create_time,update_time,create_user,update_user) VALUES({cid},1,{quote(name)},{cid},1,NOW(),NOW(),1,1);')
    for did, wid, cid, name, price, stock, calories, tags, image, description in DISHES:
        values = [did, name, cid, Decimal(price), '/images/' + image, description]
        out.append('INSERT INTO dish(id,name,category_id,price,image,description,status,create_time,update_time,create_user,update_user) VALUES(' + ','.join(map(quote, values)) + ',1,NOW(),NOW(),1,1);')
        out.append('INSERT INTO campus_dish(dish_id,window_id,stock,calories,tags) VALUES(' + ','.join(map(quote, [did, wid, stock, calories, tags])) + ');')
    accounts = [(1, '20260001', '林同学', 'STUDENT', None), (2, '20260002', '陈同学', 'STUDENT', None), (10, 'window01', '烟火小炒 · 工作人员', 'STAFF', 1), (11, 'window02', '轻食计划 · 工作人员', 'STAFF', 2), (12, 'window03', '麦香面馆 · 工作人员', 'STAFF', 3), (20, 'canteen_admin', '食堂管理员', 'ADMIN', None), (21, 'canteen_screen', '校园食堂大屏', 'SCREEN', None)]
    for uid, username, name, role, window in accounts:
        out.append('INSERT INTO user(id,openid,name,create_time) VALUES(' + ','.join(map(quote, [uid, 'campus:' + username, name])) + ',NOW());')
        out.append('INSERT INTO campus_account(user_id,username,password_hash,display_name,role,window_id,enabled) VALUES(' + ','.join(map(quote, [uid, username, password_hash('Campus@2026'), name, role, window])) + ',1);')
    # 原管理员入口不沿用上游公开默认密码，本地演示统一从校园窗口账号进入。
    out.append("INSERT INTO employee(id,name,username,password,phone,sex,id_number,status,create_time,update_time,create_user,update_user) VALUES(1,'系统保留','legacy_disabled'," + quote(hashlib.md5(secrets.token_bytes(32)).hexdigest()) + ",'00000000000','0','DEMO-DISABLED',0,NOW(),NOW(),1,1);")
    for days in range(6, -1, -1):
        for wid in (1, 2, 3):
            day = (now - timedelta(days=days)).date()
            sid = 1000 + days * 3 + wid
            out.append(f"INSERT INTO campus_slot(id,window_id,service_date,start_time,end_time,capacity,reserved) VALUES({sid},{wid},{quote(day)},'11:40','12:00',12,1);")
            did = {1: (days % 4) + 1, 2: (days % 3) + 7, 3: (days % 4) + 11}[wid]
            dish = next(d for d in DISHES if d[0] == did)
            oid = 1000 + days * 3 + wid
            when = datetime.combine(day, datetime.min.time()).replace(hour=11, minute=10)
            out.append('INSERT INTO orders(id,number,status,user_id,address_book_id,order_time,checkout_time,pay_method,pay_status,amount,remark,address,consignee,estimated_delivery_time,delivery_status,delivery_time,pack_amount,tableware_number,tableware_status) VALUES(' + ','.join(map(quote, [oid, f'DEMO-{oid}', 5, 2, 0, when, when, 0, 1, Decimal(dish[4]), '初始化体验记录', WINDOWS[wid-1][3], '陈同学', when + timedelta(minutes=30), 0, when + timedelta(minutes=35), 0, 1, 0])) + ');')
            out.append('INSERT INTO order_detail(order_id,dish_id,name,number,amount,image) VALUES(' + ','.join(map(quote, [oid, did, dish[3], 1, Decimal(dish[4]), '/images/' + dish[8]])) + ');')
            out.append('INSERT INTO campus_order(order_id,user_id,window_id,slot_id,request_id,pickup_code,demo,picked_up_at) VALUES(' + ','.join(map(quote, [oid, 2, wid, sid, f'demo-reservation-{oid}', f'DM{oid:06d}', 1, when + timedelta(minutes=35)])) + ');')
    notices = [('让等待少一点，让午餐从容一点', '食堂预约现已开放。选好窗口和取餐时段，收到备餐完成提醒后再到窗口出示取餐码。未支付的预约将在 15 分钟后自动释放。', '就餐指南'), ('一份餐具，一起少一点浪费', '提交预约时可以选择无需餐具。我们鼓励自带餐盒，按需点餐，让每一份食物都被珍惜。', '绿色校园'), ('遇到问题，窗口会听见', '在校园公告页提交对具体窗口的意见，窗口工作人员会在工作台回复。已完成取餐的订单也可以留下评分。', '服务通知')]
    for title, content, category in notices:
        out.append('INSERT INTO campus_notice(title,content,category) VALUES(' + ','.join(map(quote, [title, content, category])) + ');')
    return '\n'.join(out) + '\n'
