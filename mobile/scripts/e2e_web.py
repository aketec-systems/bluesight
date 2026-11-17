"""End-to-end smoke test of the web build in headless Chromium.

Sample profile -> Nearby (simulated people) -> like -> match -> Bluetooth chat -> verify number ->
Around deck -> photo on tap -> Me; then a fresh sign-up that searches Monrovia from abroad.
Screenshots land in OUT.

    cd mobile && npx expo export --platform web && node scripts/build-standalone.mjs dist /tmp/site/index.html
    (cd /tmp/site && python3 -m http.server 8765 &)
    pip install playwright && playwright install chromium
    python3 scripts/e2e_web.py http://localhost:8765/
"""
import sys, time
from playwright.sync_api import sync_playwright

URL = sys.argv[1] if len(sys.argv) > 1 else 'http://localhost:8765/'
OUT = '/tmp/shots'
import os
os.makedirs(OUT, exist_ok=True)
errors = []

def shot(page, name):
    page.screenshot(path=f'{OUT}/{name}.png')
    print('shot', name)

with sync_playwright() as p:
    b = p.chromium.launch()
    ctx = b.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2)
    page = ctx.new_page()
    page.on('console', lambda m: errors.append(f'{m.type}: {m.text}') if m.type in ('error', 'warning') else None)
    page.on('pageerror', lambda e: errors.append(f'pageerror: {e}'))
    page.goto(URL)
    page.get_by_text('Create my profile').wait_for(timeout=20000)
    time.sleep(1.2)
    shot(page, '01-welcome')
    page.get_by_text('Skip with a sample profile').click()
    page.get_by_text('No data used').wait_for(timeout=10000)
    time.sleep(7)
    shot(page, '02-nearby')
    # like people until a match appears
    matched = False
    for i in range(12):
        like = page.get_by_role('button', name='Like', exact=True)
        if like.count() == 0:
            break
        like.first.click()
        for _ in range(8):
            time.sleep(0.5)
            if page.get_by_text("It's a match").count():
                matched = True
                break
        if matched:
            break
    print('matched:', matched)
    if matched:
        time.sleep(1)
        shot(page, '03-match')
        page.get_by_role('button', name='Message').first.click()
        time.sleep(1.5)
        page.get_by_role('textbox', name='Message', exact=True).fill('Hey! Where are you standing?')
        page.get_by_role('button', name='Send').click()
        time.sleep(8)
        shot(page, '04-chat')
        page.get_by_role('button', name='Back').first.click()
        time.sleep(1)
    page.get_by_role('tab', name='Chats').click()
    time.sleep(1)
    shot(page, '05-chats')
    page.get_by_role('tab', name='Around').click()
    time.sleep(1)
    shot(page, '06-around-locked')
    page.get_by_text('Verify my number').click()
    time.sleep(1)
    page.get_by_role('textbox', name='Phone number').fill('+231770123456')
    page.get_by_text('Text me a code').click()
    page.get_by_text('Demo code: 123456').wait_for(timeout=8000)
    page.get_by_role('textbox', name='Code').fill('123456')
    shot(page, '07-verify')
    page.get_by_role('button', name='Verify').click()
    page.get_by_text('Signed in as', exact=False).wait_for(timeout=8000)
    page.get_by_role('button', name='Back').first.click()
    time.sleep(4)
    shot(page, '08-around-deck')
    lp = page.get_by_role('button', name='Load photo', exact=False)
    if lp.count():
        lp.first.click()
        time.sleep(2)
        shot(page, '09-around-photo')
    for i in range(4):
        page.get_by_role('button', name='Like', exact=True).first.click()
        time.sleep(1.2)
    time.sleep(8)
    shot(page, '10-after-around-likes')
    if page.get_by_text("It's a match").count():
        page.get_by_text('Keep looking').click()
        time.sleep(0.5)
    page.get_by_role('tab', name='Me').click()
    time.sleep(1.5)
    shot(page, '11-me')
    page.mouse.wheel(0, 900)
    time.sleep(0.8)
    shot(page, '12-me-data')

    # A fresh install, the long way: someone in Maryland sets their search to Monrovia while signing up.
    ctx2 = b.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2)
    page = ctx2.new_page()
    page.on('console', lambda m: errors.append(f'{m.type}: {m.text}') if m.type in ('error', 'warning') else None)
    page.on('pageerror', lambda e: errors.append(f'pageerror: {e}'))
    page.goto(URL)
    page.get_by_text('Create my profile').click()
    page.get_by_role('textbox', name='Day').fill('14')
    page.get_by_role('textbox', name='Month').fill('06')
    page.get_by_role('textbox', name='Year').fill('1996')
    page.get_by_role('button', name='Continue').click()
    page.get_by_role('textbox', name='First name').fill('Kemah')
    page.get_by_role('checkbox', name='Man', exact=True).click()
    page.get_by_role('checkbox', name='Women', exact=True).click()
    page.get_by_role('button', name='Continue').click()
    page.get_by_role('button', name='Skip for now').click()
    page.get_by_role('button', name='Continue').click()
    page.get_by_text('Where do you want to meet people?').wait_for(timeout=5000)
    page.get_by_role('radio', name='A city back home').click()
    page.get_by_role('textbox', name='Search cities').fill('monr')
    page.get_by_role('radio', name='Monrovia, Liberia').click()
    page.get_by_role('textbox', name='You live in').fill('Maryland, USA')
    time.sleep(0.5)
    shot(page, '13-where')
    page.get_by_role('button', name='Continue').click()
    page.get_by_text('Browsing Monrovia needs a verified number', exact=False).wait_for(timeout=5000)
    page.get_by_role('textbox', name='Phone number').fill('+13015550123')
    page.get_by_text('Text me a code').click()
    page.get_by_text('Demo code: 123456').wait_for(timeout=8000)
    page.get_by_role('textbox', name='Code').fill('123456')
    page.get_by_role('button', name='Verify').click()
    page.get_by_role('tab', name='Around').wait_for(timeout=8000)
    page.get_by_role('tab', name='Around').click()
    page.get_by_text('Searching Monrovia, Liberia').wait_for(timeout=8000)
    time.sleep(3)
    shot(page, '14-around-monrovia')
    page.get_by_role('button', name='Change search location').click()
    page.get_by_role('textbox', name='Search cities').wait_for(timeout=5000)
    time.sleep(0.6)
    shot(page, '15-location')
    page.get_by_role('radio', name='Near me').click()
    page.get_by_text('Searching near you').wait_for(timeout=5000)
    time.sleep(3)
    shot(page, '16-around-near')
    page.get_by_role('tab', name='Me').click()
    time.sleep(1.2)
    shot(page, '17-me-kemah')
    b.close()

print('--- console errors/warnings ---')
for e in errors:
    print(e[:300])
