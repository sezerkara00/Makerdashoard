// ═══════════════════════════════════════════════════════════
//  i18n.js — Layerstech Dashboard Çeviri Sistemi
//  Desteklenen diller: tr (Türkçe), en (İngilizce)
// ═══════════════════════════════════════════════════════════

const LANG_KEY = 'layerstech_lang';

const translations = {
    tr: {
        // ── NAV ──────────────────────────────────────────
        'nav.dashboard':    'Kontrol Paneli',
        'nav.printers':     'Yazıcılarım',
        'nav.projects':     'Projeler',
        'nav.workshop':     'Atölye',
        'nav.community':    'Baskı Seçenekleri',
        'nav.wiki':         'Wiki Sayfası',
        'nav.settings':     'Ayarlar',

        // ── TOPBAR ───────────────────────────────────────
        'topbar.search_placeholder': 'Proje veya varlık ara...',
        'topbar.create_new':         'Yeni Oluştur',

        // ── SIDEBAR FOOTER ────────────────────────────────
        'sidebar.contact_support': 'Destek Al',

        // ── NOTIFICATIONS DROPDOWN ─────────────────────
        'notif.title':        'Bildirimler',
        'notif.clear_all':    'Tümünü Temizle',
        'notif.empty':        'Bildirim bulunmuyor',
        'notif.view_all':     'Tümünü Gör',
        'notif.printer_offline_title': 'Bağlantı Kesildi',
        'notif.printer_offline_msg': '{name} bağlantısı koptu. Otomatik olarak yeniden bağlanmaya çalışılacak.',
        'notif.printer_reconnected_title': 'Bağlantı Yeniden Sağlandı',
        'notif.printer_reconnected_msg': '{name} ile bağlantı otomatik olarak yeniden kuruldu.',

        // ── HOME SECTIONS ─────────────────────────────
        'home.get_started':      'Başlarken',
        'home.recent_projects':  'Son Projeler',
        'home.view_all':         'Tümünü Gör',

        // ── TOOL CARDS ───────────────────────────────────
        'tool.3d_printing': '3D Baskı',
        'tool.laser':       'Lazer',
        'tool.printers':    'Yazıcılarım',
        'tool.workspace':   'Çalışma Alanı',

        // ── COMMUNITY PANEL ─────────────────────────────
        'community.title':              'Baskı Seçenekleri',
        'community.latest_discussions': 'KALİBRASYON & KALİTE',
        'print_options.pa':             'Pressure Advance',
        'print_options.pa_desc':        'Köşelerin düzgün çıkması ve belirgin hatlar için basınç ayarı.',
        'print_options.flow':           'Flow Rate / Akış Hızı',
        'print_options.flow_desc':      'Duvar kalınlığı ve katman yapışması için akış çarpanı.',
        'print_options.vib':            'Titreşim Engelleme (Input Shaping)',
        'print_options.vib_desc':       'Yüksek hızdaki sarsıntı ve gölgelenme etkisini azaltın.',

        // ── PRINTERS VIEW ─────────────────────────────
        'printers.title':       'Yazıcılarım',
        'printers.subtitle':    'Yazıcılarınızın durumunu izleyin ve kontrol edin.',
        'printers.add_new':     'Yeni Yazıcı Ekle',
        'printers.stat_total':  'Toplam',
        'printers.stat_active': 'Yazdırıyor',
        'printers.stat_idle':   'Hazır',
        'printers.stat_offline':'Çevrimdışı',
        'printers.filter_mode':       'Bağlantı',
        'printers.filter_status':     'Durum',
        'printers.filter_all':        'Tümü',
        'printers.filter_printing':   'Yazdırılıyor',
        'printers.filter_idle':       'Hazır',
        'printers.filter_offline':    'Çevrimdışı',
        'printers.filter_lan':        'LAN Modu',
        'printers.filter_online':     'Online Modu',

        // ── PROJECTS VIEW ─────────────────────────────
        'projects.title':    'Tüm Projeler',
        'projects.subtitle': 'Bağlı yazıcılardaki tüm baskı işlerini ve geçmişi görüntüleyin.',
        'projects.search_placeholder': 'Proje ara...',
        'projects.badge_printing':  'Yazdırılıyor',
        'projects.badge_paused':    'Duraklatıldı',
        'projects.badge_completed': 'Tamamlandı',
        'projects.badge_cancelled': 'İptal Edildi',
        'projects.badge_failed':    'Başarısız',
        'projects.tab_timelapse':   'Timelapse Video',

        // ── NOTIFICATIONS PAGE ─────────────────────────
        'notif_page.title':    'Tüm Bildirimler',
        'notif_page.subtitle': 'Yazıcı durum değişikliklerini ve baskı olaylarını buradan takip edin.',
        'notif_page.clear_all': 'Tümünü Temizle',
        'notif_page.filter_all':     'Tamamı',
        'notif_page.filter_start':   '▶ Başladı',
        'notif_page.filter_pause':   '⏸ Duraksatıldı',
        'notif_page.filter_resume':  '▶▶ Sürdürüldü',
        'notif_page.filter_complete':'✓ Tamamlandı',
        'notif_page.filter_cancel':  '✕ İptal',
        'notif_page.filter_fail':    '⚠ Hata',
        'notif_page.machine_label':  'Makine',

        // ── PRINTER STATUS ─────────────────────────────
        'status.printing':   'Yazdırılıyor',
        'status.paused':     'Duraklatıldı',
        'status.idle':       'Hazır',
        'status.offline':    'Çevrimdışı',
        'status.connecting': 'Bağlanıyor...',

        // ── PRINTER CARD ──────────────────────────────
        'printer.cancel':       'İptal',
        'printer.pause':        'Duraklat',
        'printer.resume':       'Sürdür',
        'printer.connect':      'Bağlan',
        'printer.delete':       'Sil',
        'printer.go_host':      'Go Host',
        'printer.wait':         'Lütfen bekleyin...',
        'printer.remaining':    'Kalan Süre',
        'printer.speed':        'Hız',
        'printer.extruder_speed': 'İtme Hızı',
        'printer.flow':        'Akış Hızı',
        'printer.disconnected': 'Yazıcı ile bağlantı kesildi.',
        'printer.connecting_msg': 'Yazıcı bağlantısı kuruluyor',
        'printer.no_printers':  'Kayıtlı Yazıcı Bulunmuyor',
        'printer.no_printers_desc': 'Yazıcı durumlarını izlemek ve kontrol etmek için ilk yazıcınızı ekleyin.',
        'printer.no_results':   'Sonuç Bulunamadı',
        'printer.no_camera':    'Kamera yayını bulunamadı',
        'printer.camera_select':'Kamera:',
        'printer.mock_camera':  'Simüle Kamera',
        'printer.sd_card':      'SD Kart',

        // ── MODAL ─────────────────────────────────────
        'modal.add_printer_title':  'Yeni Yazıcı Ekle',
        'modal.edit_printer_title': 'Yazıcıyı Düzenle',
        'modal.printer_name':       'Yazıcı Adı',
        'modal.printer_name_ph':    'Örn: M1 PRO',
        'modal.model':              'Model',
        'modal.printer_mode':       'Bağlantı Modu',
        'modal.mode_online':        'Online (Klipper API)',
        'modal.mode_lan':           'LAN Modu',
        'modal.log_folder':         'Log Klasörü',
        'modal.log_folder_ph':      'Klasör seçin...',
        'modal.log_folder_info':    'Yazıcı ismine göre bu klasör içinde alt klasör açılacaktır.',
        'modal.printer_address':    'Yazıcı Adresi / IP (Host)',
        'modal.address_ph':         'Örn: 192.168.1.100 veya localhost:7125',
        'modal.cancel':             'Vazgeç',
        'modal.add_submit':         'Yazıcıyı Ekle',
        'modal.edit_submit':        'Değişiklikleri Kaydet',

        // ── CONFIRM MODAL ─────────────────────────────
        'confirm.title':    'Emin misiniz?',
        'confirm.message':  'Bu işlemi gerçekleştirmek istediğinizden emin misiniz?',
        'confirm.cancel':   'Vazgeç',
        'confirm.ok':       'Evet, İptal Et',

        // ── WIKI / HOST VIEW ──────────────────────────
        'wiki.title':           'Layers Tech Wiki',
        'wiki.back':            'Geri',
        'wiki.forward':         'İleri',
        'wiki.reload':          'Yenile',
        'host.title':           'Yazıcı Arayüzü',
        'host.back':            'Yazıcılara Dön',
        'host.reload':          'Yenile',

        // ── FOOTER ────────────────────────────────────
        'footer.show_log': 'Tanı Log\'unu Göster',

        // ── NOTIFICATIONS RELATIVE TIME ───────────────
        'time.just_now':    'Az önce',
        'time.minutes_ago': ' dk önce',
        'time.hours_ago':   ' sa önce',

        // ── NOTIF TYPE LABELS ─────────────────────────
        'notif_label.start':    'Başladı',
        'notif_label.resume':   'Sürdürüldü',
        'notif_label.pause':    'Duraklatıldı',
        'notif_label.cancel':   'İptal',
        'notif_label.complete': 'Tamamlandı',
        'notif_label.fail':     'Başarısız',

        // ── FILTER EMPTY MSG ──────────────────────────
        'filter.no_result_filter': 'Bu filtreye uygun',
        'filter.printers_suffix':  'yazıcı bulunmamaktadır.',
        'filter.no_notif':         'Bu filtre için bildirim bulunmuyor',

        // ── LANGUAGE PICKER ───────────────────────────
        'lang.label': 'Dil',

        // ── WORKSPACE ──────────────────────────────────
        'workspace.title':               'Atölye İstatistikleri',
        'workspace.subtitle':            'Bağlı yazıcılarınızın kullanım sürelerini ve filament harcamalarını inceleyin.',
        'workspace.stat_total_time':     'Toplam Çalışma Süresi',
        'workspace.stat_total_filament': 'Toplam Filament Tüketimi',
        'workspace.stat_jobs_count':     'Toplam Baskı İşi',
        'workspace.stat_success_rate':   'Başarı Oranı',
        'workspace.hours':               'saat',
        'workspace.meters':              'metre',
        'workspace.calc_title':          'Filament & Baskı Maliyet Hesaplayıcı',
        'workspace.calc_subtitle':       'Makara fiyatı ve gram bilgisi ile baskı maliyetini hesaplayın.',
        'workspace.calc_spool_price':    'Makara Fiyatı (TL)',
        'workspace.calc_spool_weight':   'Makara Ağırlığı (gram)',
        'workspace.calc_print_weight':   'Baskı Ağırlığı (gram)',
        'workspace.calc_submit':         'Maliyeti Hesapla',
        'workspace.calc_result_total':   'Tahmini Baskı Maliyeti',
        'workspace.printer_usage':       'Yazıcı Bazlı Tüketim',
        'workspace.printer_no_data':     'Moonraker API bağlantısı bulunamadı veya yazıcı çevrimdışı.',
        'workspace.chart_title':         'Baskı Geçmişi',
        'workspace.chart_success':       'Başarılı',
        'workspace.chart_failed':        'Başarısız',
        'workspace.chart_no_data':       'Bu dönem için veri bulunamadı',
        'workspace.chart_tab_7d':        '7G',
        'workspace.chart_tab_30d':       '30G',
        'workspace.chart_tab_12m':       '12A',
        'workspace.chart_total_prints':   'Baskı Sayısı',
        'workspace.prints':               'Baskı',
        'workspace.filter_all_printers':  'Tüm Yazıcılar',
        'workspace.recent_prints':        'Son Baskılar',
        'workspace.no_recent_prints':     'Son baskı bulunmuyor',
        // ── WEBHOOK ERRORS ─────────────────────────────
        'webhook.show_details':          'Detayları Göster',
        'webhook.hide_details':          'Detayları Gizle',
        'webhook.shutdown_msg':          'Yazıcı durduruldu (Shutdown)',
        'webhook.error_msg':             'Yazıcıda hata oluştu (Error)',
        'webhook.restore_title':         'Yazıcı hatasını göster',
        // ── PROFILE ────────────────────────────────────
        'nav.profile':                   'Profilim',
        'profile.title':                 'Kullanıcı Profili',
        'profile.subtitle':              'Aktif kullanıcı oturumu ve hesap detayları.',
        'profile.logged_in_as':          'Giriş Yapan Kullanıcı',
        'profile.role':                  'Yetki Seviyesi',
        'profile.administrator':         'Yönetici',
        'profile.session_time':          'Oturum Süresi',
        'profile.recent_actions':        'Hesap İşlemleri',
        'profile.sign_out':              'Oturumu Kapat',
        'profile.refresh':               'Verileri Yenile',
        // ── SETTINGS ───────────────────────────────────
        'settings.title':                'Sistem Ayarları',
        'settings.subtitle':             'Uygulama tercihlerini ve renk temasını buradan değiştirebilirsiniz.',
        'settings.theme_select':         'Görünüm Teması',
        'settings.active':               'Aktif',
        'settings.select':               'Seç',
        // ── NOTIFICATION SETTINGS ────────────────────────
        'settings.notifications_title':  'Bildirim ve Ses Ayarları',
        'settings.webhook_notifs':       'Webhook Hata Bildirimleri',
        'settings.webhook_notifs_desc':  'Yazıcı hata/durma durumlarını üst barda uyarı olarak göster.',
        'settings.sound_alerts':         'Sesli Bildirimler',
        'settings.sound_alerts_desc':    'Baskı tamamlandığında ve cihaz hata durumuna girdiğinde sesli uyarı çal.',
        'settings.windows_notifs':       'Windows Bildirimleri',
        'settings.windows_notifs_desc':  'Uygulama arka planda veya simge durumundayken sistem bildirimlerini göster.',
        'settings.minimize_to_tray':     'Sistem Tepsisine Küçült',
        'settings.minimize_to_tray_desc':'Uygulama kapatıldığında sistem tepsisinde arka planda çalışmaya devam eder.',
        // ── GCODE PREVIEW & UPLOADER ──────────────────────
        'gcode.preview_title': 'Yazdırma Seçenekleri',
        'gcode.meta_name': 'Dosya Adı',
        'gcode.meta_size': 'Boyut',
        'gcode.meta_filament': 'Filament Tüketimi',
        'gcode.meta_time': 'Baskı Süresi',
        'gcode.meta_layers': 'Katman Sayısı',
        'gcode.upload_and_start': 'Yükle ve Hemen Başlat',
        'gcode.only_upload': 'Sadece Yükle',
        'gcode.close': 'Kapat',
        'gcode.start_print': 'Baskıyı Başlat',
        'gcode.drag_drop_title': 'G-code Yükle',
        'gcode.drag_drop_desc': 'Dosyayı yüklemek için yazıcı kartının üzerine sürükleyin.',
        'gcode.print_options_title': 'Yazdırma Seçenekleri',
        'gcode.bed_leveling': 'Yatak Tesviyesi',
        'gcode.spaghetti_detection': 'Spagetti Algılama',
        'gcode.nozzle_cleaning': 'Yazdırma Öncesi Nozzle Temizliği',
        'gcode.timelapse_comp': 'Timelapse Kompanzasyonu',
        'gcode.post_shutdown': 'Baskı Sonrası Kapat',
        'gcode.shutdown_delay': 'Kapanma Süresi',
        'gcode.printer_ip': 'Yazıcı IP',
        'gcode.export': 'Dışa Aktar',
        'gcode.send': 'Gönder',
        'gcode.print': 'Yazdır',
        'gcode.cancel': 'İptal',
        'gcode.layer_height': 'Katman Yüksekliği',
        'gcode.object_height': 'Nesne Yüksekliği',
    },

    en: {
        // ── NAV ──────────────────────────────────────────
        'nav.dashboard':    'Dashboard',
        'nav.printers':     'My Printers',
        'nav.projects':     'Projects',
        'nav.workshop':     'Workshop',
        'nav.community':    'Print Options',
        'nav.wiki':         'Wiki Page',
        'nav.settings':     'Settings',

        // ── TOPBAR ───────────────────────────────────────
        'topbar.search_placeholder': 'Search projects or assets...',
        'topbar.create_new':         'Create New',

        // ── SIDEBAR FOOTER ────────────────────────────────
        'sidebar.contact_support': 'Contact Support',

        // ── NOTIFICATIONS DROPDOWN ─────────────────────
        'notif.title':        'Notifications',
        'notif.clear_all':    'Clear All',
        'notif.empty':        'No notifications',
        'notif.view_all':     'View All',
        'notif.printer_offline_title': 'Connection Lost',
        'notif.printer_offline_msg': '{name} disconnected. Attempting to reconnect automatically...',
        'notif.printer_reconnected_title': 'Connection Re-established',
        'notif.printer_reconnected_msg': 'Successfully reconnected to {name} automatically.',

        // ── HOME SECTIONS ─────────────────────────────
        'home.get_started':      'Get Started',
        'home.recent_projects':  'Recent Projects',
        'home.view_all':         'View All',

        // ── TOOL CARDS ───────────────────────────────────
        'tool.3d_printing': '3D Printing',
        'tool.laser':       'Laser',
        'tool.printers':    'My Printers',
        'tool.workspace':   'Workspace',

        // ── COMMUNITY PANEL ─────────────────────────────
        'community.title':              'Print Options',
        'community.latest_discussions': 'CALIBRATION & QUALITY',
        'print_options.pa':             'Pressure Advance',
        'print_options.pa_desc':        'Fine-tune extrusion pressure for clean corners and sharp lines.',
        'print_options.flow':           'Flow Rate / Extrusion Multiplier',
        'print_options.flow_desc':      'Fine-tune extrusion multiplier for precise wall thickness.',
        'print_options.vib':            'Vibration Compensation',
        'print_options.vib_desc':       'Minimize ghosting and ringing at high printing speeds.',

        // ── PRINTERS VIEW ─────────────────────────────
        'printers.title':       'My Printers',
        'printers.subtitle':    'Monitor and control your printers.',
        'printers.add_new':     'Add New Printer',
        'printers.stat_total':  'Total',
        'printers.stat_active': 'Printing',
        'printers.stat_idle':   'Ready',
        'printers.stat_offline':'Offline',
        'printers.filter_mode':       'Connection',
        'printers.filter_status':     'Status',
        'printers.filter_all':        'All',
        'printers.filter_printing':   'Printing',
        'printers.filter_idle':       'Ready',
        'printers.filter_offline':    'Offline',
        'printers.filter_lan':        'LAN Mode',
        'printers.filter_online':     'Online Mode',

        // ── PROJECTS VIEW ─────────────────────────────
        'projects.title':    'All Projects',
        'projects.subtitle': 'View all print jobs and history from connected printers.',
        'projects.search_placeholder': 'Search projects...',
        'projects.badge_printing':  'Printing',
        'projects.badge_paused':    'Paused',
        'projects.badge_completed': 'Completed',
        'projects.badge_cancelled': 'Cancelled',
        'projects.badge_failed':    'Failed',
        'projects.tab_timelapse':   'Timelapse Videos',

        // ── NOTIFICATIONS PAGE ─────────────────────────
        'notif_page.title':    'All Notifications',
        'notif_page.subtitle': 'Track printer status changes and print events here.',
        'notif_page.clear_all': 'Clear All',
        'notif_page.filter_all':     'All',
        'notif_page.filter_start':   '▶ Started',
        'notif_page.filter_pause':   '⏸ Paused',
        'notif_page.filter_resume':  '▶▶ Resumed',
        'notif_page.filter_complete':'✓ Completed',
        'notif_page.filter_cancel':  '✕ Cancelled',
        'notif_page.filter_fail':    '⚠ Failed',
        'notif_page.machine_label':  'Machine',

        // ── PRINTER STATUS ─────────────────────────────
        'status.printing':   'Printing',
        'status.paused':     'Paused',
        'status.idle':       'Ready',
        'status.offline':    'Offline',
        'status.connecting': 'Connecting...',

        // ── PRINTER CARD ──────────────────────────────
        'printer.cancel':       'Cancel',
        'printer.pause':        'Pause',
        'printer.resume':       'Resume',
        'printer.connect':      'Connect',
        'printer.delete':       'Delete',
        'printer.go_host':      'Go Host',
        'printer.wait':         'Please wait...',
        'printer.remaining':    'Remaining',
        'printer.speed':        'Speed',
        'printer.extruder_speed': 'Extrusion',
        'printer.flow':        'Flow Rate',
        'printer.disconnected': 'Printer disconnected.',
        'printer.connecting_msg': 'Connecting to printer',
        'printer.no_printers':  'No Printers Registered',
        'printer.no_printers_desc': 'Add your first printer to monitor and control printer statuses.',
        'printer.no_results':   'No Results Found',
        'printer.no_camera':    'No camera stream found',
        'printer.camera_select':'Camera:',
        'printer.mock_camera':  'Simulated Camera',
        'printer.sd_card':      'SD Card',

        // ── MODAL ─────────────────────────────────────
        'modal.add_printer_title':  'Add New Printer',
        'modal.edit_printer_title': 'Edit Printer',
        'modal.printer_name':       'Printer Name',
        'modal.printer_name_ph':    'e.g. M1 PRO',
        'modal.model':              'Model',
        'modal.printer_mode':       'Connection Mode',
        'modal.mode_online':        'Online (Klipper API)',
        'modal.mode_lan':           'LAN Mode',
        'modal.log_folder':         'Log Folder',
        'modal.log_folder_ph':      'Select folder...',
        'modal.log_folder_info':    'A subfolder matching the printer\'s name will be created inside this folder.',
        'modal.printer_address':    'Printer Address / IP (Host)',
        'modal.address_ph':         'e.g. 192.168.1.100 or localhost:7125',
        'modal.cancel':             'Cancel',
        'modal.add_submit':         'Add Printer',
        'modal.edit_submit':        'Save Changes',

        // ── CONFIRM MODAL ─────────────────────────────
        'confirm.title':    'Are you sure?',
        'confirm.message':  'Are you sure you want to perform this action?',
        'confirm.cancel':   'Cancel',
        'confirm.ok':       'Yes, Cancel It',

        // ── WIKI / HOST VIEW ──────────────────────────
        'wiki.title':           'Layers Tech Wiki',
        'wiki.back':            'Back',
        'wiki.forward':         'Forward',
        'wiki.reload':          'Reload',
        'host.title':           'Printer Interface',
        'host.back':            'Back to Printers',
        'host.reload':          'Reload',

        // ── FOOTER ────────────────────────────────────
        'footer.show_log': 'Show Diagnostic Log',

        // ── NOTIFICATIONS RELATIVE TIME ───────────────
        'time.just_now':    'Just now',
        'time.minutes_ago': ' min ago',
        'time.hours_ago':   ' hr ago',

        // ── NOTIF TYPE LABELS ─────────────────────────
        'notif_label.start':    'Started',
        'notif_label.resume':   'Resumed',
        'notif_label.pause':    'Paused',
        'notif_label.cancel':   'Cancelled',
        'notif_label.complete': 'Completed',
        'notif_label.fail':     'Failed',

        // ── FILTER EMPTY MSG ──────────────────────────
        'filter.no_result_filter': 'No',
        'filter.printers_suffix':  'printers match this filter.',
        'filter.no_notif':         'No notifications for this filter',

        // ── LANGUAGE PICKER ───────────────────────────
        'lang.label': 'Language',

        // ── WORKSPACE ──────────────────────────────────
        'workspace.title':               'Workshop Statistics',
        'workspace.subtitle':            'Analyze usage times and filament consumption of your connected printers.',
        'workspace.stat_total_time':     'Total Work Time',
        'workspace.stat_total_filament': 'Total Filament Usage',
        'workspace.stat_jobs_count':     'Total Print Jobs',
        'workspace.stat_success_rate':   'Success Rate',
        'workspace.hours':               'hours',
        'workspace.meters':              'meters',
        'workspace.calc_title':          'Filament & Print Cost Calculator',
        'workspace.calc_subtitle':       'Calculate print cost using spool price and print weight.',
        'workspace.calc_spool_price':    'Spool Price ($)',
        'workspace.calc_spool_weight':   'Spool Weight (grams)',
        'workspace.calc_print_weight':   'Print Weight (grams)',
        'workspace.calc_submit':         'Calculate Cost',
        'workspace.calc_result_total':   'Estimated Print Cost',
        'workspace.printer_usage':       'Usage per Printer',
        'workspace.printer_no_data':     'No Moonraker API connection found or printer is offline.',
        'workspace.chart_title':         'Print History',
        'workspace.chart_success':       'Successful',
        'workspace.chart_failed':        'Failed',
        'workspace.chart_no_data':       'No data found for this period',
        'workspace.chart_tab_7d':        '7D',
        'workspace.chart_tab_30d':       '30D',
        'workspace.chart_tab_12m':       '12M',
        'workspace.chart_total_prints':   'Print Count',
        'workspace.prints':               'prints',
        'workspace.filter_all_printers':  'All Printers',
        'workspace.recent_prints':        'Recent Prints',
        'workspace.no_recent_prints':     'No recent prints',
        // ── WEBHOOK ERRORS ─────────────────────────────
        'webhook.show_details':          'Show Details',
        'webhook.hide_details':          'Hide Details',
        'webhook.shutdown_msg':          'Printer shutdown',
        'webhook.error_msg':             'Printer error',
        'webhook.restore_title':         'Show printer error',
        // ── PROFILE ────────────────────────────────────
        'nav.profile':                   'Profile',
        'profile.title':                 'User Profile',
        'profile.subtitle':              'Active user session and account details.',
        'profile.logged_in_as':          'Logged In User',
        'profile.role':                  'Authorization Role',
        'profile.administrator':         'Administrator',
        'profile.session_time':          'Session Duration',
        'profile.recent_actions':        'Account Actions',
        'profile.sign_out':              'Sign Out',
        'profile.refresh':               'Refresh Data',
        // ── SETTINGS ───────────────────────────────────
        'settings.title':                'System Settings',
        'settings.subtitle':             'Configure application preferences and UI themes.',
        'settings.theme_select':         'Interface Theme',
        'settings.active':               'Active',
        'settings.select':               'Select',
        // ── NOTIFICATION SETTINGS ────────────────────────
        'settings.notifications_title':  'Notification & Sound Settings',
        'settings.webhook_notifs':       'Webhook Error Notifications',
        'settings.webhook_notifs_desc':  'Show printer error/shutdown states as a topbar warning alert.',
        'settings.sound_alerts':         'Sound Alerts',
        'settings.sound_alerts_desc':    'Play a sound when printing completes or a device enters an error state.',
        'settings.windows_notifs':       'Windows Notifications',
        'settings.windows_notifs_desc':  'Show native system notifications when the application is in the background or minimized.',
        'settings.minimize_to_tray':     'Minimize to Tray',
        'settings.minimize_to_tray_desc':'Keep the application running in the system tray when closed.',
        // ── GCODE PREVIEW & UPLOADER ──────────────────────
        'gcode.preview_title': 'Print Options',
        'gcode.meta_name': 'File Name',
        'gcode.meta_size': 'Size',
        'gcode.meta_filament': 'Filament Consumption',
        'gcode.meta_time': 'Print Time',
        'gcode.meta_layers': 'Layer Count',
        'gcode.upload_and_start': 'Upload and Start Print',
        'gcode.only_upload': 'Only Upload',
        'gcode.close': 'Close',
        'gcode.start_print': 'Start Print',
        'gcode.drag_drop_title': 'Upload G-code',
        'gcode.drag_drop_desc': 'Drag file over printer card to upload.',
        'gcode.print_options_title': 'Print Options',
        'gcode.bed_leveling': 'Bed Leveling',
        'gcode.spaghetti_detection': 'Spaghetti Detection',
        'gcode.nozzle_cleaning': 'Pre-print Nozzle Cleaning',
        'gcode.timelapse_comp': 'Timelapse Compensation',
        'gcode.post_shutdown': 'Auto Shutdown after Print',
        'gcode.shutdown_delay': 'Shutdown Delay',
        'gcode.printer_ip': 'Printer IP',
        'gcode.export': 'Export',
        'gcode.send': 'Send',
        'gcode.print': 'Print',
        'gcode.cancel': 'Cancel',
        'gcode.layer_height': 'Layer Height',
        'gcode.object_height': 'Object Height',
    }
};

// ── Current language state ────────────────────────────────
let currentLang = 'tr';

try {
    const stored = localStorage.getItem(LANG_KEY);
    if (stored && translations[stored]) currentLang = stored;
} catch (e) {}

// ── Core translate function ───────────────────────────────
function t(key) {
    const dict = translations[currentLang] || translations['tr'];
    return dict[key] !== undefined ? dict[key] : (translations['tr'][key] || key);
}

// ── Set language & re-render all i18n elements ────────────
function setLang(lang) {
    if (!translations[lang]) return;
    currentLang = lang;
    try { localStorage.setItem(LANG_KEY, lang); } catch (e) {}
    applyTranslations();
    document.documentElement.lang = lang;
}

// ── Apply all data-i18n attributes in the DOM ─────────────
function applyTranslations() {
    document.querySelectorAll('[data-i18n]').forEach(el => {
        const key = el.getAttribute('data-i18n');
        el.textContent = t(key);
    });
    document.querySelectorAll('[data-i18n-ph]').forEach(el => {
        el.placeholder = t(el.getAttribute('data-i18n-ph'));
    });
    document.querySelectorAll('[data-i18n-title]').forEach(el => {
        el.title = t(el.getAttribute('data-i18n-title'));
    });

    // Update lang switcher button active state
    document.querySelectorAll('.lang-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.lang === currentLang);
    });
}

// Export for use in home.js
if (typeof module !== 'undefined') {
    module.exports = { t, setLang, currentLang: () => currentLang, applyTranslations };
}
