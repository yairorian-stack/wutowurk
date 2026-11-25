import{test,expect,type Page}from'@playwright/test';
async function login(page:Page,email='fictional-'+crypto.randomUUID()+'@example.invalid'){await page.goto('/');await page.getByLabel('登録済みメールアドレス').fill(email);await page.getByRole('button',{name:'確認コードを送信'}).click();await page.getByLabel('メールに届いた6桁コード').fill('123456');await page.getByRole('button',{name:'ログイン',exact:true}).click();await expect(page.getByLabel('担当者名')).toHaveValue('架空スタッフ');}
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
