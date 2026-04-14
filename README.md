# 🤖 Türkçe Otomatik Haber Botu (WordPress & Telegram)

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D14.0.0-brightgreen)](https://nodejs.org/)
[![Python Version](https://img.shields.io/badge/python-%3E%3D3.7-blue)](https://www.python.org/)

Türkiye'nin önde gelen haber kaynaklarından (TRT, NTV, Hürriyet, Webtekno, Bloomberg HT vb.) son dakika haberlerini otomatik olarak çeken, akıllı önem sıralaması yapan ve belirlediğiniz **WordPress** sitenize veya **Telegram** kanalınıza gönderen tam otomatik bir haber botu.

---

## 🌟 Öne Çıkan Özellikler

| Özellik | Açıklama |
| :--- | :--- |
| **Çift Platform Desteği** | Hem **WordPress** (REST API) hem de **Telegram** için ayrı botlar içerir. |
| **Geniş Kaynak Ağı** | **15+ Türkçe RSS kaynağı** + **NewsAPI.org** entegrasyonu. |
| **Akıllı Kategorizasyon** | Haber başlığı ve içeriğine göre otomatik kategori atama (Teknoloji, Spor, Ekonomi, Sağlık...). |
| **Yapay Zeka Önem Sıralaması** | Acil durum, önemli kişi ve gündem anahtar kelimelerine göre haberlere **önem puanı** verir. |
| **Gelişmiş Çakışma Önleme** | MD5 hash ve URL bazlı veritabanı ile aynı haberin tekrar gönderilmesini engeller. |
| **Medya Desteği** | Haberlerle birlikte **öne çıkan görseli** otomatik olarak indirir ve yükler. |
| **Karakter Düzeltme** | RSS'ten gelen bozuk Türkçe karakterleri (Ã§, ÅŸ) otomatik olarak düzeltir (`ç`, `ş`). |
| **Zamanlayıcı Modu** | Belirlediğiniz aralıklarla (örn: 3-6 dk) otomatik çalışır. Sunucuda **7/24** çalışmaya uygundur. |

---

## 📦 İçerik ve Teknoloji

Bu repo iki ana bot içerir:

1.  **WordPress Haber Botu (`haber.js`)**
    *   **Dil:** Node.js (JavaScript)
    *   **Kütüphaneler:** `axios`, `rss-parser`, `cheerio`
    *   **Görev:** RSS ve API'den haberleri çeker, WordPress REST API ile taslak veya yayınlanmış gönderi oluşturur.

2.  **Telegram Haber Botu (`haber.py`)**
    *   **Dil:** Python 3
    *   **Kütüphaneler:** `requests`, `feedparser`, `beautifulsoup4`
    *   **Görev:** Haberleri çeker ve Telegram Bot API aracılığıyla belirlenen kanala/gruba HTML formatında gönderir.

---

## 🚀 Hızlı Başlangıç

### WordPress Botu (Node.js)

1.  **Depoyu Klonla:**
    ```bash
    git clone https://github.com/ossiqntwo/haber-botu.git
    cd haber-botu
Bağımlılıkları Yükle:

bash
npm install axios rss-parser cheerio
Yapılandır (haber.js):
Dosyanın en altındaki bot tanımlamasını kendi bilgilerinle güncelle.

javascript
const bot = new WordPressHaberBotu({
    wordpressUrl: 'https://SENIN-SITEN.COM', // Sitenin adresi
    wpUsername: 'admin',                     // WP Kullanıcı Adın
    wpAppPassword: 'XXXX XXXX XXXX XXXX',    // WP Uygulama Şifresi (Profil -> Uygulama Şifreleri)
    newsApiKey: '856ec0c76ffd4384a6ba17a6fb2b0c26', // Ücretsiz NewsAPI anahtarın
    maxHaberPerRun: 2,  // Her çalışmada kaç haber gönderilsin
    autoPublish: false, // true = Doğrudan yayınla, false = Taslak olarak kaydet
    sendImage: true,    // Öne çıkan görsel eklensin mi
    minInterval: 3,     // Haberler arası min bekleme (dk)
    maxInterval: 6      // Haberler arası max bekleme (dk)
});
Not: WordPress uygulama şifresi almak için WordPress Yönetim Paneli > Kullanıcılar > Profil > Uygulama Şifreleri yolunu izle.

Çalıştır:

bash
node haber.js
Telegram Botu (Python)
Python'u Yükle: Sisteminde Python 3.7+ kurulu olduğundan emin ol.

Bağımlılıkları Yükle:

bash
pip install requests feedparser beautifulsoup4
Bot Oluştur: Telegram'da @BotFather ile yeni bir bot oluştur ve Token'ı al.

Yapılandır (haber.py):
Dosyanın en altındaki bot tanımlamasını güncelle.

python
bot = TelegramHaberBotu({
    'telegramToken': 'SENIN_BOT_TOKENIN', # BotFather'dan aldığın token
    'chatId': '-1003892722496',           # Hedef Kanal/Grup ID (örn: -100...)
    'newsApiKey': '856ec0c76ffd4384a6ba17a6fb2b0c26',
    'haberPerBatch': 3,    # Her turda kaç haber gönderilsin
    'batchInterval': 2,    # Turlar arası kaç dk beklensin
    'messageDelay': 5,     # Haberler arası kaç saniye beklensin
    'sendImage': True,
    'addHashtags': True
})
Chat ID Nasıl Bulunur? Kanalına @getidsbot veya @RawDataBot ekleyip mesaj atarak öğrenebilirsin.

Çalıştır:

bash
python haber.py
📚 Desteklenen Haber Kaynakları
Kategori	Kaynaklar
Genel / Son Dakika	TRT Haber, NTV, Hürriyet, Sözcü, Cumhuriyet
Teknoloji	Webtekno, ShiftDelete, Technopat
Ekonomi	Bloomberg HT, NTV Ekonomi
Spor	NTV Spor, Fanatik
Dünya	BBC Türkçe
Magazin	Hürriyet Magazin
Sağlık	NTV Sağlık
API Desteği	NewsAPI.org (Türkiye Gündemi)
💻 Sunucuda 7/24 Çalıştırma
Botun sürekli çalışması için bir Linux sunucuda screen veya pm2 kullanmanız önerilir.

PM2 ile (Node.js için):

bash
npm install -g pm2
pm2 start haber.js --name "wp-haber-botu"
pm2 save
pm2 startup
Screen ile (Her iki dil için de):

bash
screen -S telegram-bot
python haber.py
# CTRL+A+D ile screen'den çıkabilirsiniz.
⚠️ Sorumluluk Reddi
Bu bot, haber sitelerinin herkese açık RSS beslemelerini kullanır. Botu kullanırken telif haklarına ve kaynak gösterme kurallarına uymak sizin sorumluluğunuzdadır. Geliştirici, botun kullanımından doğacak hukuki sorunlardan sorumlu değildir.

🔗 Bağlantılar
GitHub Deposu: https://github.com/ossiqntwo/haber-botu

Geliştirici Web Sitesi: https://ossiqn.com.tr

⭐ Projeyi faydalı bulduysanız yıldız vermeyi unutmayın!
