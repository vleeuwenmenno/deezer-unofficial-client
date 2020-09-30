import { Client } from 'discord-rpc';
import path from 'path';
import InputManager from './input';
import Settings from './settings';
import Song from './model/Song';
import { app, dialog, globalShortcut, Tray, Menu, BrowserWindow, ipcMain, nativeImage, Notification } from 'electron';
import settings from 'electron-settings';
import { min } from 'moment';
 
const appVersion = require('../package.json').version;
const RPC = new Client({ transport: 'ipc' });

let mw:BrowserWindow;

let tray:Tray;

let latestSong: Song;

let latestSongIsFav:boolean;
let clearedRPC: boolean;
let normaliseAudio: boolean;
let minimizeToTray:boolean;
let closeToTray:boolean;

var pauseCheckerTimer = setInterval(pauseChecker, 60000);

function pauseChecker() 
{
    if (!latestSong.listening)
    {
        RPC.clearActivity();
        clearedRPC = true;
    }
}

function abortPauseChecker() 
{
  clearInterval(pauseCheckerTimer);
}

// Create the main window and setup browser parameters
function createMainWindow() 
{
    let userAgent: string;
    let splashWindow: BrowserWindow;
    const mainWindow = createWindow(false, 'deezer-preload.js');

    // Main
    mainWindow.setMenu(null);

    // Set user agent based on platform used ...
    switch (process.platform) 
    {    
        case 'linux':
            userAgent = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/83.0.4103.106 Safari/537.36'
        break;

        case 'darwin':
            userAgent = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/83.0.4103.106 Safari/537.36'
        break;

        // win32
        default:
            userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/83.0.4103.106 Safari/537.36'
        break;
    }

    mainWindow.loadURL(Settings.DeezerUrl, { userAgent: userAgent });

    // Prepare main window, close the splash screen and register shortcuts.
    mainWindow.webContents.once('did-finish-load', () => 
    {
        mainWindow.show();
        splashWindow.close();
        registerShortcuts(mainWindow.webContents, mainWindow);
    });

    // Setup events for mainwindow
    mainWindow.on('close', (event) => 
    {
        event.preventDefault();

        if (closeToTray)
            mainWindow.hide();
        else
        {
            app.exit();
        }
    });

    mainWindow.on('minimize', function () 
    {
        if (minimizeToTray)
            mainWindow.hide();
    });

    // Splash
    splashWindow = createWindow(true);
    splashWindow.setResizable(false);
    splashWindow.setMaximizable(false);
    splashWindow.setMenu(null);

    splashWindow.loadURL(`file://${__dirname}/view/splash.html`)
}

function createWindow(visibility: boolean, preload?: string) 
{
    if (preload) 
    {
        return new BrowserWindow({
            width: Settings.WindowWidth,
            height: Settings.WindowHeight,
            show: visibility,
            title: 'Deezer - Community UI',
            webPreferences: {
                preload: path.join(__dirname, preload),
                nodeIntegration: true,
                experimentalFeatures: true
            }
        });
    }

    return new BrowserWindow({
        width: Settings.WindowWidth,
        height: Settings.WindowHeight,
        show: visibility,
        title: 'Deezer - Community UI'
    });
}

async function registerShortcuts(webContents: Electron.WebContents, mainWindow: BrowserWindow) 
{
    const input = new InputManager(webContents);
    minimizeToTray = await settings.get('minimizeToTray') == true;
    closeToTray = await settings.get('closeToTray') == true;

    // Setup tray icon and media controls inside the tray menu
    const image = nativeImage.createFromPath(`${__dirname}/view/icon.png`)
    image.setTemplateImage(true)
    tray = new Tray(image)
    const contextMenu = Menu.buildFromTemplate([
        { 
            label: 'Toggle', type: 'normal', click: () => 
            { 
                if (mainWindow.isVisible())
                    mainWindow.hide();
                else
                    mainWindow.show();
            } 
        },
        { type: 'separator' },
        {
            type: "submenu",
            label: "Player",
            submenu:
            [
                { 
                    label: 'Play/Pause', type: 'normal', click: () => 
                    { 
                        input.space();
                    } 
                },
                { 
                    label: 'Next', type: 'normal', click: () => 
                    { 
                        input.shiftRight();
                    }  
                },
                { 
                    label: 'Previous', type: 'normal', click: () => 
                    { 
                        input.shiftLeft();
                    }  
                }
            ]
        },
        { 
            label: 'Settings', type: 'submenu', 
            submenu: 
            [
                { label: 'Hide to tray in minimize', checked: minimizeToTray, type: 'checkbox', click: async () => 
                    {
                        minimizeToTray = !minimizeToTray;
                        await settings.set('minimizeToTray', minimizeToTray);
                    } 
                },
                { label: 'Hide to tray in close', checked: closeToTray, type: 'checkbox', click: async () => 
                    {
                        closeToTray = !closeToTray;
                        await settings.set('closeToTray', closeToTray);
                    } 
                },
                { 
                    label: 'Deezer preferences', 
                    type: 'normal', 
                    click: () => 
                    {
                        mainWindow.webContents.executeJavaScript("document.getElementsByClassName(\"topbar-profile\")[0].click()").then( (result) => {
                            mainWindow.webContents.executeJavaScript("document.getElementsByClassName(\"account-link is-main animate-wobble\")[0].click()");
                        });
                        mainWindow.show();
                        mainWindow.focus();
                    } 
                },
                { type: 'separator' },
                { 
                    label: 'Audio volume', type: 'submenu', 
                    submenu: 
                    [
                        { label: '0%', type: 'normal', click: () => {  mainWindow.webContents.executeJavaScript("dzPlayer.control.setVolume(0);"); } },
                        { label: '25%', type: 'normal', click: () => {  mainWindow.webContents.executeJavaScript("dzPlayer.control.setVolume(0.25);"); } },
                        { label: '50%', type: 'normal', click: () => {  mainWindow.webContents.executeJavaScript("dzPlayer.control.setVolume(0.5);"); } },
                        { label: '75%', type: 'normal', click: () => {  mainWindow.webContents.executeJavaScript("dzPlayer.control.setVolume(0.75);"); } },
                        { label: '100%', type: 'normal', click: () => {  mainWindow.webContents.executeJavaScript("dzPlayer.control.setVolume(1);"); } }
                    ]
                },
                { 
                    label: 'Toggle normalise audio', 
                    type: 'normal', 
                    click: () => 
                    {
                        normaliseAudio = !normaliseAudio;
                        if (normaliseAudio)
                            mainWindow.webContents.executeJavaScript("dzPlayer.control.setNormalized(1);");
                        else
                            mainWindow.webContents.executeJavaScript("dzPlayer.control.setNormalized(0);");
                    } 
                }
            ]
        },
        { type: 'separator' },
        { 
            label: 'Favorite this song', 
            type: 'normal',
            click: () => 
            {
                mainWindow.webContents.sendInputEvent({keyCode: 'L', type: 'keyDown', modifiers: []});
                try
                {
                    mainWindow.webContents.executeJavaScript(`document.getElementsByClassName("svg-icon-group-btn option-btn")[0].innerHTML.toString().includes("svg-icon svg-icon-love-outline is-active")`).then( (result) => {
                        if (result == true)
                        {
                            new Notification({
                                title: 'Song removed from favorites',
                                body: latestSong.name + ' by ' + latestSong.artist + " has been removed from your favorites ..."
                            }).show();
                        }
                        else
                        {
                            new Notification({
                                title: 'Song added to favorites',
                                body: latestSong.name + ' by ' + latestSong.artist + " has been added to your favorites ..."
                            }).show();
                        }
                    });
                }
                catch (err)
                { }
            } 
        },
        { type: 'normal', label: 'App version '+appVersion+'', click: () => { require("electron").shell.openExternal("https://github.com/vleeuwenmenno/deezer-unofficial-client"); } },
        { type: 'separator' },
        { 
            label: 'Quit', type: 'normal', click: () => 
            { 
                mainWindow.destroy();
            } 
        }
    ]);
    
    // Hide and show mainwindow when double clicking tray icon
    tray.on('double-click', function (event) 
    {
        if (mainWindow.isVisible())
            mainWindow.hide();
        else
            mainWindow.show();
    })
    
    tray.setToolTip('No music played yet')
    tray.setContextMenu(contextMenu)

    // Setup global shortcuts for media controls
    globalShortcut.register('MediaPlayPause', () => 
    {
        input.space();
    });
    globalShortcut.register('MediaPreviousTrack', () => 
    {
        input.shiftLeft();
    });
    globalShortcut.register('MediaNextTrack', () => 
    {
        input.shiftRight();
    });
    mw = mainWindow;
}

// When song changed, update Rich presence and tray tooltip
ipcMain.on('song-changed', (event: any, song: Song) => 
{
    mw.webContents.executeJavaScript(`document.getElementsByClassName("svg-icon-group-btn option-btn")[0].innerHTML.toString().includes("svg-icon svg-icon-love-outline is-active")`).then( (result) => {
        song.isFav = result;
        console.log(song);
        latestSong = song;         
    });

    if (!song.artist) 
    {
        song.artist = "Unknown Artist";
    }

    if (!song.name) 
    {
        song.name = "Unknown Song";
    }

    if (song.listening) 
    {
        RPC.setActivity({
            details: song.name,
            state: song.artist,
            endTimestamp: song.time,
            largeImageKey: "default",
            largeImageText: "Deezer - Community UI",
            smallImageKey: "listening",
            smallImageText: "Listening",
            instance: false,
        });
        tray.setToolTip(song.artist + " - " + song.name + ' ')
        clearedRPC = false;
    } 
    else if (!clearedRPC && !song.listening)
    {
        RPC.setActivity({
            details: song.name,
            state: song.artist,
            largeImageKey: "default",
            largeImageText: "Deezer - Community UI",
            smallImageKey: "paused",
            smallImageText: "Paused",
            instance: false,
        });
        tray.setToolTip('Music paused ');
    }
});

// App
app.on('ready', createMainWindow);

// Initialize rich presence
RPC.login({ clientId: Settings.DiscordClientID }).catch(() => 
{
    dialog.showErrorBox("RPC login failed", "Please verify if Discord is opened/working then launch the app again ...");
});