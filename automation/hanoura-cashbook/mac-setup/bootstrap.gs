// The builder replaces __PRIVATE_CONFIG__ only in the private delivery bundle.
function ownerSetup_(){
  ownerBootstrapIfNeeded_();
  autoInstallOwner_({email:Session.getEffectiveUser().getEmail(),role:'admin'});
}
function ownerBootstrapIfNeeded_(){
  var settings=__PRIVATE_CONFIG__,p=props_();
  var existing=p.getProperty('CASHBOOK_SPREADSHEET_ID');
  if(existing&&existing!==settings.spreadsheetId)throw new Error('接続先が異なります。設定を停止しました');
  if(!existing)p.setProperty('CASHBOOK_SPREADSHEET_ID',settings.spreadsheetId);
  if(!p.getProperty('CASHBOOK_SOURCE_GID'))p.setProperty('CASHBOOK_SOURCE_GID',String(settings.sourceGid));
  if(!p.getProperty('CASHBOOK_START_DATE'))p.setProperty('CASHBOOK_START_DATE',settings.startDate);
  if(!p.getProperty('CASHBOOK_USERS'))p.setProperty('CASHBOOK_USERS',JSON.stringify(settings.users));
}
function autoInstallOwner_(u){
  var settings=__PRIVATE_CONFIG__;
  if(!u||u.role!=='admin'||String(u.email).toLowerCase()!==settings.ownerEmail.toLowerCase())throw new Error('管理者本人の確認が必要です');
  if(props_().getProperty('CASHBOOK_INSTALL_READY')==='true')return;
  var file=DriveApp.getFileById(config_().id);
  if(file.getSharingAccess()!==DriveApp.Access.PRIVATE)file.setSharing(DriveApp.Access.PRIVATE,DriveApp.Permission.VIEW);
  installCashbook_();
  props_().setProperty('CASHBOOK_INSTALL_READY','true');
}
