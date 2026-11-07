"""Verify real campus APIs against the isolated demo database, including quota/stock races."""
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from pathlib import Path
from urllib.error import HTTPError
from urllib.request import Request, urlopen
import json
import secrets
import time
import uuid

BASE = 'http://127.0.0.1:18088/campus'
RESULTS = []

def call(path, method='GET', data=None, token=None):
    headers = {'Content-Type': 'application/json'}
    if token:
        headers['Authorization'] = 'Bearer ' + token
    req = Request(BASE + path, data=None if data is None else json.dumps(data).encode(), method=method, headers=headers)
    try:
        with urlopen(req, timeout=35) as response:
            return json.load(response)
    except HTTPError as ex:
        return json.load(ex)

def ok(path, method='GET', data=None, token=None):
    result = call(path, method, data, token)
    assert result.get('code') == 1, (path, result.get('msg') or result.get('message') or result)
    return result.get('data')

def check(name, condition):
    assert condition, name
    RESULTS.append({'name': name, 'passed': True})
    print('PASS', name, flush=True)

def fresh_user():
    username = '26' + str(secrets.randbelow(9000000000) + 1000000000)
    result = ok('/auth/register', 'POST', {'username': username, 'password': 'Verify@2026', 'displayName': '功能验证同学'})
    return result['token']

def add(token, dish, count=1):
    for _ in range(count):
        ok('/student/cart', 'POST', {'dishId': dish, 'delta': 1}, token)

def submit(token, slot, key=None):
    return call('/student/orders', 'POST', {'slotId': slot, 'requestId': key or str(uuid.uuid4()), 'remark': '自动化功能验证', 'needCutlery': False}, token)

def stock(dish):
    return next(int(d['stock']) for d in ok('/public/menu') if int(d['id']) == dish)

def cancel(token, order_id):
    return ok(f'/student/orders/{order_id}/cancel', 'POST', {}, token)

def main():
    started = time.time()
    menu = ok('/public/menu')
    check('菜单来自真实接口且含 14 道校园菜品', len(menu) == 14)
    check('未登录不能查看学生购物车', call('/student/cart').get('code') != 1)
    student, other = fresh_user(), fresh_user()
    staff = ok('/auth/login', 'POST', {'username': 'window01', 'password': 'Campus@2026'})['token']
    other_staff = ok('/auth/login', 'POST', {'username': 'window02', 'password': 'Campus@2026'})['token']
    admin = ok('/auth/login', 'POST', {'username': 'canteen_admin', 'password': 'Campus@2026'})['token']
    screen = ok('/auth/login', 'POST', {'username': 'canteen_screen', 'password': 'Campus@2026'})['token']
    tomorrow = (datetime.now(timezone(timedelta(hours=8))) + timedelta(days=1)).date().isoformat()
    # 全新初始化的数据库只带历史演示时段，先发布目标日期的时段，再检查大屏名额汇总。
    ok(f'/public/slots?windowId=1&date={tomorrow}')
    screen_data = ok(f'/screen/overview?date={tomorrow}', token=screen)
    def keys_in(value):
        if isinstance(value, dict):
            return set(value).union(*(keys_in(child) for child in value.values()))
        if isinstance(value, list):
            return set().union(*(keys_in(child) for child in value)) if value else set()
        return set()
    screen_keys = keys_in(screen_data)
    check('独立大屏汇总接口返回全校窗口及时段数据', len(screen_data['windows']) == 3 and len(screen_data['trend']) == 7 and screen_data['slotUsage']['publishedSlots'] > 0)
    check('大屏接口不包含学生身份或取餐凭证字段', not screen_keys.intersection({'studentName', 'studentNo', 'pickupCode', 'displayName', 'username', 'userId', 'phone'}))
    check('只读展示账号不能查看学生订单或管理数据', call('/student/cart', token=screen).get('code') != 1 and call('/staff/menu', token=screen).get('code') != 1)
    check('学生账号不能进入独立数据大屏', call(f'/screen/overview?date={tomorrow}', token=student).get('code') != 1)
    admin_menu = ok('/staff/menu', token=admin)
    admin_board = ok('/staff/dashboard', token=admin)
    check('管理员后台可跨窗口查看 14 道菜品和全校汇总', len(admin_menu) == 14 and admin_board['window']['name'] == '全校食堂')
    check('学生不能进入窗口管理接口', call('/staff/orders', token=student).get('code') != 1)
    check('被篡改的 JWT 被拒绝', call('/student/cart', token=student[:-8] + 'ABCDEFGH').get('code') != 1)
    check('密码摘要不会出现在用户资料中', 'passwordHash' not in ok('/me', token=student))
    date = tomorrow
    slots = ok(f'/public/slots?windowId=1&date={date}')
    slot = slots[0]
    before_stock = stock(1)
    before_reserved = int(slot['reserved'])
    add(student, 1, 2)
    check('重复添加同一菜品实际增加份数', int(ok('/student/cart', token=student)[0]['number']) == 2)
    check('同一餐盘拒绝混入其他窗口菜品', call('/student/cart', 'POST', {'dishId': 7, 'delta': 1}, student).get('code') != 1)
    check('非法购物车调整量被拒绝', call('/student/cart', 'POST', {'dishId': 1, 'delta': 99}, student).get('code') != 1)
    key = str(uuid.uuid4())
    with ThreadPoolExecutor(max_workers=8) as pool:
        duplicates = list(pool.map(lambda _: submit(student, slot['id'], key), range(8)))
    ids = {row.get('data', {}).get('id') for row in duplicates}
    check('八次并发重复提交只创建一份订单', len(ids) == 1 and None not in ids)
    order = duplicates[0]['data']
    expected_price = Decimal(str(next(d['price'] for d in menu if int(d['id']) == 1))) * 2
    check('订单金额由数据库菜价计算', Decimal(str(order['amount'])) == expected_price)
    check('重复提交只扣减一次库存', stock(1) == before_stock - 2)
    check('他人不能支付本人订单', call(f"/student/orders/{order['id']}/pay", 'POST', {}, other).get('code') != 1)
    paid = ok(f"/student/orders/{order['id']}/pay", 'POST', {}, student)
    paid_again = ok(f"/student/orders/{order['id']}/pay", 'POST', {}, student)
    check('演示支付幂等并生成同一八位取餐码', paid['pickupCode'] == paid_again['pickupCode'] and len(paid['pickupCode']) == 8)
    check('其他窗口不能接单', call(f"/staff/orders/{order['id']}/accept", 'POST', {}, other_staff).get('code') != 1)
    cancel(student, order['id']); cancel(student, order['id'])
    check('重复取消不重复归还库存', stock(1) == before_stock)
    updated_slots = ok(f'/public/slots?windowId=1&date={date}')
    check('取消归还预约名额', int(next(s['reserved'] for s in updated_slots if s['id'] == slot['id'])) == before_reserved)
    add(student, 1)
    order = submit(student, slot['id'])['data']
    ok(f"/student/orders/{order['id']}/pay", 'POST', {}, student)
    moved = ok(f"/student/orders/{order['id']}/reschedule", 'POST', {'slotId': slots[1]['id']}, student)
    check('备餐前可以改约同窗口未来时段', moved['startTime'] == slots[1]['startTime'])
    ok(f"/staff/orders/{order['id']}/accept", 'POST', {}, staff)
    check('开始备餐后不能取消', call(f"/student/orders/{order['id']}/cancel", 'POST', {}, student).get('code') != 1)
    check('未核销订单不能评价', call('/student/reviews', 'POST', {'orderId': order['id'], 'rating': 5, 'content': '测试'}, student).get('code') != 1)
    ready = ok(f"/staff/orders/{order['id']}/ready", 'POST', {}, staff)
    check('其他窗口无法核销取餐码', call('/staff/pickup', 'POST', {'code': ready['pickupCode']}, other_staff).get('code') != 1)
    picked = ok('/staff/pickup', 'POST', {'code': ready['pickupCode']}, staff)
    check('本窗口核销后订单为已取餐', int(picked['status']) == 5 and picked['pickedUpAt'])
    check('重复核销被拒绝', call('/staff/pickup', 'POST', {'code': ready['pickupCode']}, staff).get('code') != 1)
    review = {'orderId': order['id'], 'rating': 5, 'content': '自动化验证：取餐完整流程通过'}
    ok('/student/reviews', 'POST', review, student)
    check('同一订单不能重复评价', call('/student/reviews', 'POST', review, student).get('code') != 1)
    ok('/student/favorites/1?enabled=true', 'PUT', {}, student)
    ok('/student/favorites/1?enabled=true', 'PUT', {}, student)
    check('收藏幂等且按学生隔离', len(ok('/student/favorites', token=student)) == 1 and len(ok('/student/favorites', token=other)) == 0)
    marker = '自动化反馈验证-' + secrets.token_hex(4)
    ok('/student/feedback', 'POST', {'windowId': 1, 'content': marker}, student)
    feedback = next(f for f in ok('/student/feedback', token=student) if f['content'] == marker)
    check('其他窗口不能回复该反馈', call('/staff/feedback/reply', 'POST', {'id': feedback['id'], 'reply': '不应成功'}, other_staff).get('code') != 1)
    ok('/staff/feedback/reply', 'POST', {'id': feedback['id'], 'reply': '测试回复已送达'}, staff)
    check('学生能看到所属窗口回复', next(f for f in ok('/student/feedback', token=student) if f['id'] == feedback['id'])['reply'] == '测试回复已送达')
    check('窗口不能修改其他窗口菜品', call('/staff/menu', 'PUT', {'id': 7, 'price': 1, 'stock': 999, 'status': 1}, staff).get('code') != 1)
    board = ok('/staff/dashboard', token=staff)
    check('真实统计接口返回完整七日趋势', len(board['trend']) == 7 and board['sales'] and board['preferences'])

    # 不同学生同时预约同一时段，验证数据库容量约束；完成后取消这些未支付验证订单。
    with ThreadPoolExecutor(max_workers=4) as pool:
        tokens = list(pool.map(lambda _: fresh_user(), range(16)))
    slot3 = ok(f'/public/slots?windowId=3&date={date}')[0]
    stock3 = stock(11)
    for token in tokens:
        add(token, 11)
    with ThreadPoolExecutor(max_workers=16) as pool:
        results = list(pool.map(lambda token: submit(token, slot3['id']), tokens))
    successful = [(token, row['data']['id']) for token, row in zip(tokens, results) if row.get('code') == 1]
    check('十六名学生抢十二个名额不会超约', len(successful) == int(slot3['capacity']) - int(slot3['reserved']))
    for token, order_id in successful:
        cancel(token, order_id)
    check('并发预约取消后库存恢复', stock(11) == stock3)
    # 在不同预约时段竞争同一道库存为奇数的菜，排除时段容量干扰，检查不会超卖。
    slots2 = ok(f'/public/slots?windowId=2&date={date}')
    stock2 = stock(7)
    for token in tokens:
        ok('/student/cart', 'DELETE', token=token); add(token, 7, 2)
    with ThreadPoolExecutor(max_workers=16) as pool:
        results = list(pool.map(lambda pair: submit(pair[1], slots2[pair[0]]['id']), enumerate(tokens)))
    successful = [(token, row['data']['id']) for token, row in zip(tokens, results) if row.get('code') == 1]
    check('不同预约时段竞争同一道菜不会超卖', len(successful) == min(16, stock2 // 2) and stock(7) == stock2 - len(successful) * 2)
    for token, order_id in successful:
        cancel(token, order_id)
    check('并发库存验证完成后可售库存恢复', stock(7) == stock2)
    report = {'passed': len(RESULTS), 'failed': 0, 'elapsedSeconds': round(time.time() - started, 2), 'checks': RESULTS, 'scope': 'isolated local demo; not a 500-user performance or real-payment certification'}
    target = Path(__file__).resolve().parents[1] / 'artifacts/api-verification.json'
    target.parent.mkdir(exist_ok=True)
    target.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
    print(json.dumps({k:v for k,v in report.items() if k!='checks'}, ensure_ascii=False), flush=True)

if __name__ == '__main__':
    main()
