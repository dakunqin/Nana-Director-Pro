const {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  shell,
  Tray,
  Menu,
  nativeImage,
  screen,
} = require("electron");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const fs = require("node:fs");
let studio,
  win,
  tray,
  splash,
  quitting = false,
  waiting = false;
if (process.env.NANA_SMOKE_ROOT)
  app.setPath("userData", process.env.NANA_SMOKE_ROOT);
app.setName("Nana Director PRO");
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (win) {
      win.show();
      win.focus();
    }
  });
  app
    .whenReady()
    .then(async () => {
      if(!process.env.NANA_SMOKE_ROOT||process.env.NANA_SMOKE_SPLASH){
        splash=new BrowserWindow({width:600,height:380,frame:false,resizable:false,backgroundColor:'#101715',show:true,webPreferences:{contextIsolation:true,nodeIntegration:false,sandbox:true}});
        await splash.loadFile(path.join(__dirname,'loading.html'));
      }
      const splashShownAt=Date.now();
      const configFile = path.join(app.getPath("userData"), "config.json");
      let config = {};
      try {
        config = JSON.parse(fs.readFileSync(configFile, "utf8"));
      } catch {}
      const root =
        config.dataRoot || path.join(app.getPath("userData"), "StudioData");
      const { createApp } = await import(
        pathToFileURL(path.join(__dirname, "../server/app.mjs")).href
      );
      studio = await createApp({ root, port: 0 });
      if(splash){
        const chosen=studio.store.settings().uiLanguage||'system',raw=chosen==='system'?app.getLocale():chosen;
        const lang=/^zh/i.test(raw)?(/tw|hk|hant/i.test(raw)?'zh-TW':'zh-CN'):raw.split('-')[0];
        const messages={en:['Starting local studio, please wait…','Opening projects and preparing the interface. Services and models will continue loading.','Local creation · Open source'],ja:['ローカルスタジオを起動しています…','プロジェクトと画面を準備しています。サービスとモデルの確認は起動後も続きます。','ローカル制作 · オープンソース'],ko:['로컬 스튜디오를 시작하는 중입니다…','프로젝트와 화면을 준비하고 있습니다. 서비스와 모델 확인은 시작 후 계속됩니다.','로컬 창작 · 오픈 소스'],es:['Iniciando el estudio local…','Preparando los proyectos y la interfaz. La comprobación de servicios y modelos continuará después.','Creación local · Código abierto'],'zh-TW':['正在啟動本地工作室，請稍候…','正在開啟專案資料庫並準備介面，服務與模型將在介面開啟後繼續偵測。','本機創作 · 開源版']};
        const text=messages[lang]||(lang==='zh-CN'?null:messages.en);
        if(text)await splash.webContents.executeJavaScript(`(()=>{const p=document.querySelectorAll('p');const text=${JSON.stringify(text)};p[0].textContent=text[0];p[1].textContent=text[1];document.querySelector('small').textContent=text[2];})()`);
      }
      const available=screen.getPrimaryDisplay().workAreaSize;
      win = new BrowserWindow({
      icon:path.join(__dirname,'icon.png'),
        width: Math.min(1920,available.width),
        height: Math.min(1040,available.height),
        minWidth: Math.min(1100,available.width),
        minHeight: Math.min(640,available.height),
        backgroundColor: "#0b0e0d",
        title: "Nana Director PRO v"+app.getVersion(),
        show: false,
        autoHideMenuBar: true,
        webPreferences: {
          preload: path.join(__dirname, "preload.cjs"),
          contextIsolation: true,
          nodeIntegration: false,
          sandbox: true,
        },
      });
      win.webContents.setWindowOpenHandler(({ url }) => {
        try {
          const u = new URL(url);
          if (u.origin === studio.url) {
            if(u.pathname==='/api/v1/openapi'){const document=new BrowserWindow({parent:win,width:1000,height:850,title:'OpenAPI 文档 · 关闭此窗口返回设置',autoHideMenuBar:true,webPreferences:{contextIsolation:true,nodeIntegration:false,sandbox:true}});document.webContents.setWindowOpenHandler(()=>({action:'deny'}));document.loadURL(url);return {action:'deny'};}
            if(u.pathname==='/api/v1/file'){
              if(u.searchParams.has('download'))win.webContents.downloadURL(url);
              else {const preview=new BrowserWindow({parent:win,width:1000,height:850,title:'图片预览 · 关闭此窗口返回工作室',autoHideMenuBar:true,webPreferences:{contextIsolation:true,nodeIntegration:false,sandbox:true}});preview.webContents.setWindowOpenHandler(()=>({action:'deny'}));preview.loadURL(url);}
              return {action:'deny'};
            }
            win.loadURL(url);
            return { action: "deny" };
          }
          if (u.protocol === "https:") shell.openExternal(url);
        } catch {}
        return { action: "deny" };
      });
      win.webContents.on("will-navigate", (event, url) => {
        if (new URL(url).origin !== studio.url) event.preventDefault();
      });
      win.webContents.on("will-attach-webview", (event) =>
        event.preventDefault(),
      );
      win.webContents.session.setPermissionRequestHandler(
        (_webContents, _permission, callback) => callback(false),
      );
      await win.loadURL(studio.url);
      if(splash)await new Promise(resolve=>setTimeout(resolve,Math.max(0,1200-(Date.now()-splashShownAt))));
      if (!process.env.NANA_SMOKE_ROOT) win.show();
      splash?.destroy();splash=null;
      // Reuse a bundled raster icon for the Windows notification area.
      const iconFile = path.join(__dirname, "icon.png");
      if (fs.existsSync(iconFile)) {
        tray = new Tray(nativeImage.createFromPath(iconFile));
        tray.setToolTip("Nana Director PRO");
        tray.on("double-click", () => win.show());
        tray.setContextMenu(
          Menu.buildFromTemplate([
            { label: "打开导演工作室", click: () => win.show() },
            {
              label: "退出",
              click: () => {
                win.show();
                win.close();
              },
            },
          ]),
        );
      }
      ipcMain.handle("nana:open-comfy",async(event)=>{
        if(event.sender!==win.webContents)throw new Error('拒绝访问');
        const {localServiceUrl}=await import(pathToFileURL(path.join(__dirname,'../server/security.mjs')).href);
        const settings=studio.store.settings();await shell.openExternal(localServiceUrl(settings.comfyUrl,settings.allowLan));
      });
      ipcMain.handle("nana:open-data", async (event) => {
        if (event.sender !== win.webContents) throw new Error("拒绝访问");
        await shell.openPath(root);
      });
      ipcMain.handle("nana:choose-data", async (event) => {
        if (event.sender !== win.webContents) throw new Error("拒绝访问");
        if (studio.hasWork())
          throw new Error("请等待当前任务完成，再选择新的数据盘");
        const result = await dialog.showOpenDialog(win, {
          title: "选择新的数据目录（重启后生效）",
          properties: ["openDirectory", "createDirectory"],
        });
        if (result.canceled) return null;
        const selected = result.filePaths[0];
        if (selected.startsWith(app.getAppPath()))
          throw new Error("请选择软件安装目录以外的数据目录");
        fs.mkdirSync(path.dirname(configFile), { recursive: true });
        fs.writeFileSync(configFile, JSON.stringify({ dataRoot: selected }));
        return selected;
      });
      win.on("close", async (event) => {
        if (quitting) return;
        event.preventDefault();
        if (studio.hasWork()) {
          const { response } = await dialog.showMessageBox(win, {
            type: "question",
            title: "任务仍在进行",
            message: "关闭窗口时，如何处理当前任务？",
            buttons: tray
              ? ["后台继续", "等待完成后退出", "返回工作室"]
              : ["等待完成后退出", "返回工作室"],
            defaultId: tray ? 2 : 1,
            cancelId: tray ? 2 : 1,
          });
          if (tray && response === 0) {
            win.hide();
            return;
          }
          if (response === (tray ? 1 : 0)) {
            waiting = true;
            win.hide();
            const timer = setInterval(() => {
              if (!studio.hasWork()) {
                clearInterval(timer);
                quitting = true;
                app.quit();
              }
            }, 2000);
            return;
          }
          return;
        }
        quitting = true;
        setImmediate(() => app.quit());
      });
    })
    .catch((error) => {
      splash?.destroy();
      dialog.showErrorBox("Nana 启动失败", error.stack || error.message);
      app.exit(1);
    });
  app.on("before-quit", (event) => {
    if (!quitting && studio) {
      event.preventDefault();
      win?.show();
      win?.close();
      return;
    }
    if (studio) {
      event.preventDefault();
      const current = studio;
      studio = null;
      current.close().finally(() => {
        tray?.destroy();
        app.exit(0);
      });
    }
  });
}
