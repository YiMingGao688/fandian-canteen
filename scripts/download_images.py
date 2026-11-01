"""Download demo food imagery as local assets; no remote image requests are needed when using the app."""
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from urllib.request import urlopen

root = Path(__file__).resolve().parents[1]
assets = root / 'web/public/images'
assets.mkdir(parents=True, exist_ok=True)
photos = {
    'hero.jpg': 'photo-1546069901-ba9599a7e63c',
    'chicken.jpg': 'photo-1547592180-85f173990554',
    'beef.jpg': 'photo-1651330395670-1680a92028bc',
    'rice.jpg': 'photo-1546069901-ba9599a7e63c',
    'salad.jpg': 'photo-1512621776951-a57141f2eefd',
    'soup.jpg': 'photo-1569293511145-3ab84dddd911',
    'noodles.jpg': 'photo-1657457320973-e8cf9b4d4a59',
    'orange.jpg': 'photo-1613478223719-2ab802602423',
}
def download(item):
    name, photo = item
    url = 'https://images.unsplash.com/' + photo + '?auto=format&fit=crop&w=1200&q=85&fm=jpg'
    with urlopen(url, timeout=35) as response:
        content = response.read()
        assert response.headers.get_content_type().startswith('image/')
    (assets / name).write_bytes(content)
    return f'- `{name}`: [Unsplash photo]({url})'
with ThreadPoolExecutor(max_workers=8) as pool:
    sources = list(pool.map(download, photos.items()))
(root / 'ASSET_SOURCES.md').write_text('# 菜品演示图片来源\n\n图片为界面演示示意，不是实际食堂菜品拍摄。\n\n' + '\n'.join(sources) + '\n', encoding='utf-8')
print('Downloaded', len(photos), 'demo image assets')
