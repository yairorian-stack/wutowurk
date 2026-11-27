import{test,expect,type Page}from'@playwright/test';
async function login(page:Page,email='fictional-'+crypto.randomUUID()+'@example.invalid',remember=true){await page.goto('/');await page.getByLabel('登録済みメールアドレス').fill(email);await page.getByRole('button',{name:'確認コードを送信'}).click();await page.getByLabel('メールに届いた6桁コード').fill('123456');await page.locator('#remember-device').setChecked(remember);await page.getByRole('button',{name:'ログイン',exact:true}).click();await expect(page.getByLabel('担当者名')).toHaveValue('架空スタッフ');}
test('スマートフォン・タブレットで入力・確認・保存し、現金以外の仕入れを控除しない',async({page},info)=>{
 await login(page);await page.getByLabel('総売上高（税込）').fill('1000');await page.getByLabel('クレジットカード', {exact:true}).fill('200');await page.getByLabel('PayPay',{exact:true}).fill('100');
 await page.getByRole('button',{name:'＋購入明細を追加する'}).click();await page.getByLabel('購入業者・店舗名').fill('架空商店');await page.getByLabel('購入品・購入内容').fill('架空品目');await page.getByLabel('購入金額（税込）').fill('150');await page.getByLabel('支払方法').selectOption('クレジット');
 await page.getByLabel('実際に数えた現金残高').fill('1200');await expect(page.locator('#balance')).toHaveText('¥1,200');
 if(info.project.name==='phone')await page.screenshot({path:'/tmp/hanoura-cashbook-private/input-phone.png',fullPage:true});
 await page.getByRole('button',{name:'入力内容を確認する'}).click();await expect(page.locator('#confirmation-summary')).toContainText('¥1,200');await page.getByRole('button',{name:'この内容を登録する'}).click();await expect(page.getByRole('heading',{name:'登録が完了しました'})).toBeVisible();
 if(info.project.name==='phone'){await page.setViewportSize({width:320,height:900});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:'/tmp/hanoura-cashbook-private/input-success-phone.png',fullPage:true});}
});
test('通信エラーで成功を表示せず、入力・写真を保持し、同じ内容を再送できる',async({page})=>{
 await login(page,'network-'+crypto.randomUUID()+'@example.invalid');await page.getByLabel('総売上高（税込）').fill('1000');await page.getByRole('button',{name:'＋購入明細を追加する'}).click();await page.getByLabel('購入業者・店舗名').fill('架空商店');await page.getByLabel('購入品・購入内容').fill('架空品目');await page.getByLabel('購入金額（税込）').fill('100');
 await page.getByLabel('レシート・領収書の写真').setInputFiles({name:'fictional.png',mimeType:'image/png',buffer:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/lDkAAAAASUVORK5CYII=','base64')});await expect(page.getByAltText('送信するレシート写真')).toBeVisible();
 await page.getByRole('button',{name:'入力内容を確認する'}).click();await page.getByRole('button',{name:'この内容を登録する'}).click();await expect(page.getByRole('alert')).toContainText('通信エラー');await expect(page.getByRole('heading',{name:'登録が完了しました'})).toBeHidden();
 await page.getByRole('button',{name:'入力へ戻る'}).click();await expect(page.getByLabel('総売上高（税込）')).toHaveValue('1,000');await expect(page.getByAltText('送信するレシート写真')).toBeVisible();await page.getByRole('button',{name:'入力内容を確認する'}).click();await page.getByRole('button',{name:'この内容を登録する'}).click();await expect(page.getByRole('heading',{name:'登録が完了しました'})).toBeVisible();
});
test('日付・担当者・金額・写真の下書きを同じ利用者の再読込で復元する',async({page})=>{await login(page);await page.getByLabel('総売上高（税込）').fill('2345');await expect(page.locator('#draft-status')).toContainText('下書き保存済み');await page.reload();await expect(page.getByLabel('総売上高（税込）')).toHaveValue('2,345');await expect(page.locator('#draft-status')).toContainText('復元');});


test('記憶した端末では新しいタブも確認コードを省略し、ログアウトすると解除する',async({page,context})=>{
 await login(page);expect(await page.evaluate(()=>localStorage.getItem('cashbook-session'))).toBeTruthy();expect(await page.evaluate(()=>sessionStorage.getItem('cashbook-session'))).toBeNull();
 const next=await context.newPage();await next.goto('/');await expect(next.getByLabel('担当者名')).toHaveValue('架空スタッフ');await expect(next.locator('#login')).toBeHidden();
 await next.getByRole('button',{name:'ログアウト',exact:true}).click();await expect(next.getByLabel('登録済みメールアドレス')).toBeVisible();expect(await next.evaluate(()=>localStorage.getItem('cashbook-session'))).toBeNull();await page.reload();await expect(page.getByLabel('登録済みメールアドレス')).toBeVisible();
});
test('端末を記憶しない場合は新しいタブにログインを引き継がない',async({page,context})=>{
 await login(page,'temporary-'+crypto.randomUUID()+'@example.invalid',false);expect(await page.evaluate(()=>localStorage.getItem('cashbook-session'))).toBeNull();expect(await page.evaluate(()=>sessionStorage.getItem('cashbook-session'))).toBeTruthy();
 const next=await context.newPage();await next.goto('/');await expect(next.getByLabel('登録済みメールアドレス')).toBeVisible();await page.reload();await expect(page.getByLabel('担当者名')).toHaveValue('架空スタッフ');
});
test('元帳の読み取りエラーだけでは端末のログイン情報を消さない',async({page})=>{
 await login(page);const token=await page.evaluate(()=>localStorage.getItem('cashbook-session'));
 await page.route('**/rpc',async route=>{const request=route.request().postDataJSON();if(request.name==='getCashbookBootstrap')await route.fulfill({json:{error:'架空の元帳読み取りエラー'}});else await route.continue();});
 await page.reload();await expect(page.getByRole('alert')).toContainText('元帳読み取りエラー');expect(await page.evaluate(()=>localStorage.getItem('cashbook-session'))).toBe(token);
 await page.unroute('**/rpc');await page.reload();await expect(page.getByLabel('担当者名')).toHaveValue('架空スタッフ');
});
