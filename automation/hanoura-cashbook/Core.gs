/* Pure calculation and validation. No production data or addresses. */
var CashCore = (function () {
  'use strict';
  function bad(message) { throw new Error(message); }
  function text(v,max) { var s=String(v==null?'':v).trim();if(s.length>max)bad('文字数が上限を超えています');return s; }
  function money(v) {if(v===''||v==null)return 0;if(typeof v==='string'&&!/^\d{1,3}(,\d{3})*$|^\d+$/.test(v))bad('金額は0円以上の整数で入力してください');var n=Number(String(v).replace(/,/g,''));if(!Number.isSafeInteger(n)||n<0||n>100000000)bad('金額を確認してください');return n;}
  function date(v) {var s=String(v||'');var d=new Date(s+'T00:00:00Z');if(!/^\d{4}-\d{2}-\d{2}$/.test(s)||!isFinite(d.getTime())||d.toISOString().slice(0,10)!==s)bad('営業日を確認してください');return s;}
  function normalize(input,today,start) {
    if(!input||typeof input!=='object')bad('入力内容を確認してください');
    var d=date(input.date);if(d<start||d>today)bad('営業日は運用開始日から本日までを指定してください');
    var p={date:d,person:text(input.person,60),sales:money(input.sales),credit:money(input.credit),paypay:money(input.paypay),governmentVoucher:money(input.governmentVoucher),utoVoucher:money(input.utoVoucher),otherVoucher:money(input.otherVoucher),otherVoucherName:text(input.otherVoucherName,80),otherIn:money(input.otherIn),otherOut:money(input.otherOut),cashReason:text(input.cashReason,300),bankDeposit:money(input.bankDeposit),ticketSales:money(input.ticketSales),notes:text(input.notes,500),actualCash:input.actualCash===''||input.actualCash==null?null:money(input.actualCash),purchases:[]};
    if(!p.person)bad('担当者名を入力してください');
    if(p.otherVoucher&&!p.otherVoucherName)bad('その他金券の名称を入力してください');
    if((p.otherIn||p.otherOut)&&!p.cashReason)bad('その他入出金の理由を入力してください');
    var list=input.purchases||[];if(!Array.isArray(list)||list.length>20)bad('購入明細は20件までです');
    list.forEach(function(v){
      if(!v||typeof v!=='object')bad('購入明細の形式を確認してください');
      var line={vendor:text(v.vendor,100),item:text(v.item,200),amount:money(v.amount),method:text(v.method||'現金',20),notes:text(v.notes,300),photoId:text(v.photoId,100),photoData:text(v.photoData,2200000)};
      if(['現金','クレジット','掛払い','その他'].indexOf(line.method)<0)bad('支払方法を確認してください');
      if(!line.vendor&&!line.item&&!line.amount&&!line.photoData&&!line.photoId&&!line.notes)return;
      if(!line.vendor||!line.item||!line.amount)bad('購入先・購入内容・購入金額を入力してください');
      if(line.photoId&&!/^[a-zA-Z0-9_-]{8,100}$/.test(line.photoId))bad('レシート情報を確認してください');
      if(line.photoData&&line.photoId)bad('レシートを選び直してください');
      if(line.photoData&&!/^data:image\/(jpeg|png);base64,[a-zA-Z0-9+/=]+$/.test(line.photoData))bad('レシートはJPEGまたはPNG写真を選んでください');
      p.purchases.push(line);
    });
    if(JSON.stringify(p).length>6500000)bad('写真の合計サイズが大きすぎます');
    if(p.sales-p.credit-p.paypay-p.governmentVoucher-p.utoVoucher-p.otherVoucher<0)bad('決済・金券の利用額が総売上高を超えています');
    return p;
  }
  function calculate(p,previous) {
    if(!Number.isSafeInteger(previous)||Math.abs(previous)>10000000000)bad('前回残高を確認してください');
    var cashless=p.credit+p.paypay,vouchers=p.governmentVoucher+p.utoVoucher+p.otherVoucher;
    var purchases=p.purchases.reduce(function(s,l){return s+l.amount;},0),cashPurchases=p.purchases.reduce(function(s,l){return s+(l.method==='現金'?l.amount:0);},0);
    var cashSales=p.sales-cashless-vouchers,expenses=cashPurchases+p.otherOut+p.bankDeposit,income=cashSales+p.otherIn+p.ticketSales,change=income-expenses,balance=previous+change;
    if(Math.abs(balance)>10000000000)bad('現金残高が上限を超えています');
    return {sales:p.sales,cashless:cashless,vouchers:vouchers,cashSales:cashSales,purchases:purchases,cashPurchases:cashPurchases,cashExpenses:expenses,cashIncome:income,change:change,previous:previous,balance:balance,actualCash:p.actualCash,difference:p.actualCash===null?null:p.actualCash-balance};
  }
  function ledger(p) {
    var lines=[];
    function add(category,description,receipt,payment,photoId){if(receipt||payment)lines.push({date:p.date,category:category,description:description||'',receipt:receipt,payment:payment,photoId:photoId||''});}
    // Keep the existing gross-sales followed by tender-deductions layout.
    add('売上',p.person,p.sales,0);add('クレジット','カード決済',0,p.credit);add('PayPay','QR決済',0,p.paypay);
    add('行政主催金券','金券利用',0,p.governmentVoucher);add('ウトチケット','金券利用',0,p.utoVoucher);add(p.otherVoucherName||'その他金券','金券利用',0,p.otherVoucher);
    p.purchases.forEach(function(l){if(l.method==='現金')add('仕入',l.vendor+' / '+l.item+(l.notes?' / '+l.notes:''),0,l.amount,l.photoId);});
    add('その他入金',p.cashReason,p.otherIn,0);add('その他出金',p.cashReason,0,p.otherOut);add('銀行預入','店舗現金を銀行へ預入',0,p.bankDeposit);add('金券販売','利用と区別した現金受入',p.ticketSales,0);
    if(!lines.length)lines.push({date:p.date,category:'営業日報',description:'売上・現金移動なし / '+p.person,receipt:0,payment:0,photoId:''});
    return lines;
  }
  return {normalize:normalize,calculate:calculate,ledger:ledger,date:date,money:money};
})();
