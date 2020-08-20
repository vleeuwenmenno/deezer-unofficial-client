using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Components;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.HttpsPolicy;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using ElectronNET.API;
using ElectronNET.API.Entities;
using DiscordRPC;
using DiscordRPC.Logging;
using CSCore.CoreAudioAPI;

namespace Deezer_Client
{
    public class Startup
    {
        public static DiscordRpcClient discordClient;
        private BrowserWindow mainWindow;
        private string trackName;
        private string artistName;

        public Startup(IConfiguration configuration)
        {
            Configuration = configuration;
        }

        public IConfiguration Configuration { get; }

        // This method gets called by the runtime. Use this method to add services to the container.
        // For more information on how to configure your application, visit https://go.microsoft.com/fwlink/?LinkID=398940
        public void ConfigureServices(IServiceCollection services)
        {
            services.AddRazorPages();
            services.AddServerSideBlazor();
        }

        // This method gets called by the runtime. Use this method to configure the HTTP request pipeline.
        public void Configure(IApplicationBuilder app, IWebHostEnvironment env)
        {
            if (env.IsDevelopment())
            {
                app.UseDeveloperExceptionPage();
            }
            else
            {
                app.UseExceptionHandler("/Error");
                // The default HSTS value is 30 days. You may want to change this for production scenarios, see https://aka.ms/aspnetcore-hsts.
                app.UseHsts();
            }

            app.UseHttpsRedirection();
            app.UseStaticFiles();

            app.UseRouting();

            app.UseEndpoints(endpoints =>
            {
                endpoints.MapBlazorHub();
                endpoints.MapFallbackToPage("/_Host");
            });

            var opt = new BrowserWindowOptions
            {
                Icon = Environment.CurrentDirectory + "/wwwroot/img/icon.ico",
                AutoHideMenuBar = true,
                Width = 1280,
                Height = 720,
                SkipTaskbar = false,
                Fullscreenable = true,
                Resizable = true
            };

            Task.Run(async () => 
            {
                mainWindow = await Electron.WindowManager.CreateWindowAsync(opt);

                mainWindow.OnMinimize += onMinizeMainWindow;
                mainWindow.OnPageTitleUpdated += mainWindowTitleChanged;
            
                await mainWindow.WebContents.LoadURLAsync("https://deezer.com/", new LoadURLOptions
                {
                    UserAgent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/74.0.3729.169 Safari/537.36"
                });
            });

            Electron.App.BeforeQuit += App_BeforeQuit;

            MenuItem[] items = {
                new MenuItem {
                    Label = "Toggle Deezer",
                    Enabled = true,
                    Click = () => toggleWindow()
                },
                new MenuItem
                {
                    Type = MenuType.separator
                },
                // new MenuItem {
                //     Label = "Pause/Play",
                //     Enabled = true,
                //     Click = null
                // },
                // new MenuItem {
                //     Label = "Next",
                //     Enabled = true,
                //     Click =null
                // },
                // new MenuItem {
                //     Label = "Previous",
                //     Enabled = true,
                //     Click = null
                // },
                // new MenuItem
                // {
                //     Type = MenuType.separator
                // },
                new MenuItem {
                    Label = "Quit",
                    Enabled = true,
                    Click = () => Electron.App.Exit()
                }
            };

            Electron.Tray.OnDoubleClick += onTrayDoubleClick;
            Electron.Tray.OnClick += onTrayDoubleClick;
            
            Electron.Tray.Show(Environment.CurrentDirectory + "/wwwroot/img/icon.ico", items);
            Electron.Tray.SetToolTip("Deezer - Community UI");

            discordClient = new DiscordRpcClient("745729892221714508");
            discordClient.Logger = new ConsoleLogger() { Level = DiscordRPC.Logging.LogLevel.Warning };

            discordClient.OnReady += (sender, e) =>
            {
                Console.WriteLine("Received Ready from user {0}", e.User.Username);
            };
                
            discordClient.OnPresenceUpdate += (sender, e) =>
            {
                Console.WriteLine("Received Update! {0}", e.Presence);
            };
            
            //Connect to the RPC
            discordClient.Initialize();

            System.Timers.Timer t = new System.Timers.Timer();
            t.Interval = 5000;
            t.Elapsed += ((sender, e) => 
            {
                bool isPlaying = IsAudioPlaying(GetDefaultRenderDevice());
                if (!isPlaying)
                    discordClient.ClearPresence();
                else
                    updatePresence();
            });
            t.Start();
        }

        // Gets the default device for the system
        public static MMDevice GetDefaultRenderDevice()
        {
            using (var enumerator = new MMDeviceEnumerator())
            {
                return enumerator.GetDefaultAudioEndpoint(DataFlow.Render, Role.Console);
            }
        }

        // Checks if audio is playing on a certain device
        public static bool IsAudioPlaying(MMDevice device)
        {
            using (var meter = AudioMeterInformation.FromDevice(device))
            {
                return meter.PeakValue > 0;
            }
        }

        private void mainWindowTitleChanged(string obj)
        {
            trackName = obj.Split("-")[0].Trim();
            artistName = obj.Replace(" - Deezer", "").Replace(trackName+" - ", "");
            bool isPlaying = IsAudioPlaying(GetDefaultRenderDevice());

            Console.WriteLine($"Artist: `{artistName}`, track: `{trackName}`, is playing: {isPlaying}");

            if (!isPlaying)
            {
                discordClient.ClearPresence();
                return;
            }
            else
                updatePresence();
        }

        private void updatePresence()
        {
            if (artistName != "music streaming | Try Flow, download & listen to free music")
            {
                //Set the rich presence
                //Call this as many times as you want and anywhere in your code.
                discordClient.SetPresence(new RichPresence()
                {
                    Details = $"{trackName}",
                    State = $"by {artistName}",
                    // Timestamps = new Timestamps(time, end),
                    Assets = new Assets()
                    {
                        LargeImageKey = "deezer-logo",
                        LargeImageText = "Deezer",
                        SmallImageKey = "deezer-logo"
                    }
                });	
            }
        }

        private void onMinizeMainWindow()
        {
            mainWindow.Hide();
        }

        private async Task App_BeforeQuit(QuitEventArgs arg)
        {
            toggleWindow();
            arg.PreventDefault();
        }

        private void onTrayDoubleClick(TrayClickEventArgs arg1, Rectangle arg2)
        {
            toggleWindow();
        }

        private async void toggleWindow()
        {
            if (await Electron.WindowManager.BrowserWindows.First().IsVisibleAsync())
                Electron.WindowManager.BrowserWindows.First().Hide();
            else
                Electron.WindowManager.BrowserWindows.First().Show();
        }
    }
}
