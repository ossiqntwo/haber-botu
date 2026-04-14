const axios = require('axios');
const Parser = require('rss-parser');
const cheerio = require('cheerio');
const crypto = require('crypto');
const fs = require('fs');
const https = require('https');

const agent = new https.Agent({
    rejectUnauthorized: false
});

class WordPressHaberBotu {
    constructor(config) {
        this.config = {
            wordpress: {
                url: config.wordpressUrl,
                username: config.wpUsername,
                appPassword: config.wpAppPassword
            },
            newsapi: {
                key: config.newsApiKey || '856ec0c76ffd4384a6ba17a6fb2b0c26',
                baseUrl: 'https://newsapi.org/v2'
            },
            database: config.dbPath || './wordpress_haber_db.json',
            settings: {
                maxHaberPerRun: config.maxHaberPerRun || 2,
                autoPublish: config.autoPublish || false,
                sendImage: config.sendImage !== false,
                minInterval: config.minInterval || 3,
                maxInterval: config.maxInterval || 6
            }
        };

        this.parser = new Parser({
            customFields: {
                item: [
                    ['media:content', 'mediaContent'],
                    ['media:thumbnail', 'mediaThumbnail'],
                    ['enclosure', 'enclosure'],
                    ['content:encoded', 'contentEncoded']
                ]
            },
            timeout: 10000
        });

        this.database = this.loadDatabase();
        this.stats = {
            totalFetched: 0,
            totalPublished: 0,
            totalDuplicates: 0,
            totalErrors: 0,
            startTime: Date.now()
        };

        this.rssKaynaklari = {
            genel: [
                { name: 'TRT Haber', url: 'https://www.trthaber.com/sondakika.rss', category: 'gundem', priority: 1 },
                { name: 'NTV', url: 'https://www.ntv.com.tr/son-dakika.rss', category: 'gundem', priority: 1 },
                { name: 'Hürriyet', url: 'https://www.hurriyet.com.tr/rss/anasayfa', category: 'gundem', priority: 2 },
                { name: 'Sözcü', url: 'https://www.sozcu.com.tr/rss/tum-haberler.xml', category: 'gundem', priority: 2 },
                { name: 'Cumhuriyet', url: 'https://www.cumhuriyet.com.tr/rss', category: 'gundem', priority: 2 }
            ],
            ekonomi: [
                { name: 'Bloomberg HT', url: 'https://www.bloomberght.com/rss', category: 'ekonomi', priority: 3 },
                { name: 'NTV Ekonomi', url: 'https://www.ntv.com.tr/ekonomi.rss', category: 'ekonomi', priority: 3 }
            ],
            teknoloji: [
                { name: 'Webtekno', url: 'https://www.webtekno.com/rss.xml', category: 'teknoloji', priority: 4 },
                { name: 'ShiftDelete', url: 'https://shiftdelete.net/feed', category: 'teknoloji', priority: 4 },
                { name: 'Technopat', url: 'https://www.technopat.net/feed/', category: 'teknoloji', priority: 4 }
            ],
            spor: [
                { name: 'NTV Spor', url: 'https://www.ntvspor.net/son-dakika.rss', category: 'spor', priority: 5 },
                { name: 'Fanatik', url: 'https://www.fanatik.com.tr/rss', category: 'spor', priority: 5 }
            ],
            magazin: [
                { name: 'Hürriyet Magazin', url: 'https://www.hurriyet.com.tr/rss/magazin', category: 'magazin', priority: 7 }
            ],
            dunya: [
                { name: 'BBC Türkçe', url: 'https://feeds.bbci.co.uk/turkce/rss.xml', category: 'dunya', priority: 2 }
            ],
            saglik: [
                { name: 'NTV Sağlık', url: 'https://www.ntv.com.tr/saglik.rss', category: 'saglik', priority: 6 }
            ]
        };

        this.importanceKeywords = {
            acil: ['vefat', 'öldü', 'hayatını kaybetti', 'deprem', 'patlama', 'yangın', 'saldırı', 'çatışma', 'bomba', 'terör', 'kaza', 'yaralandı', 'sel', 'afet', 'şehit'],
            onemli: ['cumhurbaşkanı', 'başbakan', 'bakan', 'meclis', 'seçim', 'dolar', 'faiz', 'enflasyon', 'kriz', 'tcmb', 'operasyon', 'gözaltı'],
            gundem: ['ankara', 'istanbul', 'tbmm', 'anayasa mahkemesi', 'chp', 'ak parti', 'mhp']
        };

        this.categoryKeywords = {
            teknoloji: ['apple', 'google', 'microsoft', 'samsung', 'iphone', 'android', 'yazılım', 'yapay zeka', 'ai'],
            ekonomi: ['dolar', 'euro', 'borsa', 'faiz', 'enflasyon', 'tcmb', 'bitcoin', 'kripto'],
            spor: ['futbol', 'basketbol', 'maç', 'gol', 'transfer', 'galatasaray', 'fenerbahçe', 'beşiktaş'],
            magazin: ['ünlü', 'şarkıcı', 'oyuncu', 'dizi', 'film'],
            saglik: ['sağlık', 'doktor', 'covid', 'aşı'],
            dunya: ['abd', 'avrupa', 'rusya', 'çin', 'savaş']
        };
    }

    loadDatabase() {
        try {
            if (fs.existsSync(this.config.database)) {
                const data = fs.readFileSync(this.config.database, 'utf8');
                const parsed = JSON.parse(data);
                if (!Array.isArray(parsed.publishedHashes)) parsed.publishedHashes = [];
                if (!Array.isArray(parsed.publishedUrls)) parsed.publishedUrls = [];
                if (!Array.isArray(parsed.history)) parsed.history = [];
                return parsed;
            }
        } catch (e) {
            console.log('⚠️ Database yüklenemedi, yeni oluşturuluyor...');
        }
        return {
            publishedHashes: [],
            publishedUrls: [],
            history: [],
            totalPublished: 0,
            lastUpdate: null
        };
    }

    saveDatabase() {
        try {
            if (this.database.publishedHashes.length > 5000) {
                this.database.publishedHashes = this.database.publishedHashes.slice(-2500);
                this.database.publishedUrls = this.database.publishedUrls.slice(-2500);
            }
            fs.writeFileSync(this.config.database, JSON.stringify(this.database, null, 2));
        } catch (e) {
            console.log('❌ Database kaydedilemedi:', e.message);
        }
    }

    generateHash(text) {
        if (!text) return crypto.randomBytes(16).toString('hex');
        return crypto.createHash('md5').update(text.toLowerCase().trim()).digest('hex');
    }

    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    cleanText(text) {
        if (!text) return '';
        const $ = cheerio.load(text);
        return $.text().replace(/\s+/g, ' ').trim();
    }

    detectCategory(text) {
        if (!text) return 'genel';
        const lowerText = text.toLowerCase();
        let maxScore = 0;
        let detected = 'genel';

        for (const [category, keywords] of Object.entries(this.categoryKeywords)) {
            let score = 0;
            for (const keyword of keywords) {
                if (lowerText.includes(keyword)) score++;
            }
            if (score > maxScore) {
                maxScore = score;
                detected = category;
            }
        }
        return detected;
    }

    calculateImportance(haber) {
        const text = (haber.baslik + ' ' + haber.ozet).toLowerCase();
        let score = 0;

        for (const keyword of this.importanceKeywords.acil) {
            if (text.includes(keyword)) score += 100;
        }
        for (const keyword of this.importanceKeywords.onemli) {
            if (text.includes(keyword)) score += 50;
        }
        for (const keyword of this.importanceKeywords.gundem) {
            if (text.includes(keyword)) score += 25;
        }

        if (haber.kategori === 'genel') score += 10;
        else if (haber.kategori === 'dunya') score += 8;
        else if (haber.kategori === 'ekonomi') score += 5;

        score += (10 - haber.sourcePriority) * 3;

        const timeDiff = this.getTimeDiff(haber.tarih);
        if (timeDiff < 30) score += 20;
        else if (timeDiff < 60) score += 10;

        return score;
    }

    getTimeDiff(dateStr) {
        try {
            const pubDate = new Date(dateStr);
            const now = new Date();
            return (now - pubDate) / 1000 / 60;
        } catch {
            return 9999;
        }
    }

    isDuplicate(haber) {
        if (!haber || !haber.hash) return true;
        if (this.database.publishedHashes.includes(haber.hash)) return true;
        if (haber.link && this.database.publishedUrls.includes(haber.link)) return true;
        return false;
    }

    async fetchNewsAPI(category = 'general') {
        try {
            const response = await axios.get(`${this.config.newsapi.baseUrl}/top-headlines`, {
                params: {
                    country: 'tr',
                    category: category,
                    pageSize: 20,
                    apiKey: this.config.newsapi.key
                },
                timeout: 15000,
                httpsAgent: agent
            });

            if (response.data.status === 'ok' && Array.isArray(response.data.articles)) {
                return response.data.articles.filter(a => a && a.title).map(article => ({
                    baslik: this.cleanText(article.title),
                    ozet: this.cleanText(article.description || ''),
                    icerik: this.cleanText(article.content || article.description || ''),
                    link: article.url,
                    resim: article.urlToImage,
                    kaynak: article.source?.name || 'NewsAPI',
                    tarih: article.publishedAt || new Date().toISOString(),
                    kategori: this.detectCategory(article.title),
                    hash: this.generateHash(article.title),
                    api: 'NewsAPI',
                    sourcePriority: 1
                }));
            }
        } catch (e) {
            console.log('❌ NewsAPI hatası:', e.message);
        }
        return [];
    }

    async fetchRSS(source) {
        try {
            const feed = await this.parser.parseURL(source.url);
            if (!feed || !Array.isArray(feed.items)) return [];

            return feed.items.slice(0, 15).filter(item => item && item.title).map(item => {
                let resim = null;
                try {
                    if (item.mediaContent?.$?.url) resim = item.mediaContent.$.url;
                    else if (item.mediaThumbnail?.$?.url) resim = item.mediaThumbnail.$.url;
                    else if (item.enclosure?.url) resim = item.enclosure.url;

                    if (!resim && item.contentEncoded) {
                        const $ = cheerio.load(item.contentEncoded);
                        resim = $('img').first().attr('src');
                    }
                    if (!resim && item.content) {
                        const $ = cheerio.load(item.content);
                        resim = $('img').first().attr('src');
                    }
                } catch (e) {}

                let icerik = item.contentEncoded || item.content || item.summary || '';
                if (icerik) {
                    const $ = cheerio.load(icerik);
                    icerik = $.text().trim();
                }

                return {
                    baslik: this.cleanText(item.title),
                    ozet: this.cleanText(item.contentSnippet || item.summary || ''),
                    icerik: this.cleanText(icerik),
                    link: item.link || '',
                    resim: resim,
                    kaynak: source.name,
                    tarih: item.pubDate || item.isoDate || new Date().toISOString(),
                    kategori: source.category || this.detectCategory(item.title),
                    hash: this.generateHash(item.title),
                    api: 'RSS',
                    sourcePriority: source.priority || 5
                };
            });
        } catch (e) {
            console.log(`❌ RSS hatası (${source.name}):`, e.message);
        }
        return [];
    }

    async fetchAllRSS(categories = null) {
        const allHaberler = [];
        const targetCategories = categories || Object.keys(this.rssKaynaklari);

        for (const category of targetCategories) {
            if (this.rssKaynaklari[category]) {
                for (const source of this.rssKaynaklari[category]) {
                    const haberler = await this.fetchRSS(source);
                    allHaberler.push(...haberler);
                    await this.sleep(500);
                }
            }
        }
        return allHaberler;
    }

    async fetchAllSources(options = {}) {
        const allHaberler = [];

        if (options.newsapi !== false) {
            const newsapiHaberler = await this.fetchNewsAPI();
            allHaberler.push(...newsapiHaberler);
        }

        if (options.rss !== false) {
            const rssHaberler = await this.fetchAllRSS(options.categories);
            allHaberler.push(...rssHaberler);
        }

        return this.processHaberler(allHaberler);
    }

    processHaberler(haberler) {
        const processed = [];
        const seenHashes = new Set();

        for (const haber of haberler) {
            if (!haber || !haber.hash || !haber.baslik) continue;
            if (seenHashes.has(haber.hash)) continue;
            if (this.isDuplicate(haber)) {
                this.stats.totalDuplicates++;
                continue;
            }
            if (haber.baslik.length < 10) continue;

            haber.importanceScore = this.calculateImportance(haber);
            seenHashes.add(haber.hash);
            processed.push(haber);
        }

        processed.sort((a, b) => b.importanceScore - a.importanceScore);

        this.stats.totalFetched += processed.length;

        console.log('\n🎯 En önemli 5 haber:');
        for (let i = 0; i < Math.min(5, processed.length); i++) {
            console.log(`${i + 1}. [${processed[i].importanceScore}] ${processed[i].baslik.substring(0, 60)}...`);
        }

        return processed;
    }

    formatContent(haber) {
        const publishDate = new Date(haber.tarih).toLocaleDateString('tr-TR', {
            year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit'
        });

        let emoji = '📰';
        if (haber.importanceScore >= 100) emoji = '🚨';
        else if (haber.importanceScore >= 50) emoji = '🔴';

        let content = `
<div class="haber-icerik">
    <div class="haber-meta">
        ${emoji} <strong>Kaynak:</strong> ${haber.kaynak} | <strong>Tarih:</strong> ${publishDate}
    </div>
    
    ${haber.ozet ? `<div class="haber-ozet"><p><em>${haber.ozet}</em></p></div>` : ''}
    
    <div class="haber-govde">
        ${haber.icerik ? haber.icerik.split('\n').map(p => p.trim() ? `<p>${p}</p>` : '').join('') : ''}
    </div>
    
    <div class="haber-footer">
        ${haber.link ? `<p class="kaynak-link"><a href="${haber.link}" target="_blank" rel="noopener noreferrer nofollow">📰 Haberin Orijinal Kaynağı</a></p>` : ''}
        <p class="otomatik-uyari"><small>Bu haber otomatik olarak derlenmiştir.</small></p>
    </div>
</div>`;

        return content;
    }

    generateSlug(title) {
        if (!title) return `haber-${Date.now()}`;
        const turkishChars = { 'ç': 'c', 'ğ': 'g', 'ı': 'i', 'ö': 'o', 'ş': 's', 'ü': 'u', 'Ç': 'c', 'Ğ': 'g', 'İ': 'i', 'Ö': 'o', 'Ş': 's', 'Ü': 'u' };
        return title
            .toLowerCase()
            .replace(/[çğıöşü��ĞİÖŞÜ]/g, char => turkishChars[char] || char)
            .replace(/[^a-z0-9\s-]/g, '')
            .replace(/\s+/g, '-')
            .replace(/-+/g, '-')
            .substring(0, 100);
    }

    async getCategoryId(categoryName) {
        try {
            const response = await axios.get(`${this.config.wordpress.url}/wp-json/wp/v2/categories`, {
                params: { per_page: 100 },
                headers: {
                    'Authorization': 'Basic ' + Buffer.from(`${this.config.wordpress.username}:${this.config.wordpress.appPassword}`).toString('base64')
                },
                timeout: 10000,
                httpsAgent: agent
            });

            const existing = response.data.find(c => c.slug === categoryName || c.name.toLowerCase() === categoryName.toLowerCase());
            if (existing) return existing.id;

            const categoryNames = {
                teknoloji: 'Teknoloji',
                ekonomi: 'Ekonomi',
                spor: 'Spor',
                magazin: 'Magazin',
                saglik: 'Sağlık',
                dunya: 'Dünya',
                gundem: 'Gündem',
                genel: 'Genel'
            };

            const displayName = categoryNames[categoryName] || categoryName.charAt(0).toUpperCase() + categoryName.slice(1);

            const createResponse = await axios.post(
                `${this.config.wordpress.url}/wp-json/wp/v2/categories`,
                { name: displayName, slug: categoryName },
                {
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': 'Basic ' + Buffer.from(`${this.config.wordpress.username}:${this.config.wordpress.appPassword}`).toString('base64')
                    },
                    timeout: 10000,
                    httpsAgent: agent
                }
            );

            return createResponse.data.id;
        } catch (e) {
            console.log('❌ Kategori hatası:', e.message);
            return 1;
        }
    }

    async uploadImage(imageUrl) {
        if (!imageUrl) return null;

        try {
            const imageResponse = await axios.get(imageUrl, {
                responseType: 'arraybuffer',
                timeout: 15000,
                httpsAgent: agent,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                }
            });

            const filename = `haber-${Date.now()}.jpg`;

            const uploadResponse = await axios.post(
                `${this.config.wordpress.url}/wp-json/wp/v2/media`,
                imageResponse.data,
                {
                    headers: {
                        'Content-Type': 'image/jpeg',
                        'Content-Disposition': `attachment; filename="${filename}"`,
                        'Authorization': 'Basic ' + Buffer.from(`${this.config.wordpress.username}:${this.config.wordpress.appPassword}`).toString('base64')
                    },
                    timeout: 60000,
                    httpsAgent: agent,
                    maxContentLength: Infinity,
                    maxBodyLength: Infinity
                }
            );

            return uploadResponse.data.id;
        } catch (e) {
            console.log('❌ Resim yükleme hatası:', e.message);
            return null;
        }
    }

    async publishToWordPress(haber) {
        const status = this.config.settings.autoPublish ? 'publish' : 'draft';

        let featuredMediaId = null;
        if (haber.resim && this.config.settings.sendImage) {
            featuredMediaId = await this.uploadImage(haber.resim);
        }

        const categoryId = await this.getCategoryId(haber.kategori);

        const postData = {
            title: haber.baslik,
            content: this.formatContent(haber),
            status: status,
            categories: [categoryId],
            excerpt: haber.ozet || haber.baslik,
            slug: this.generateSlug(haber.baslik)
        };

        if (featuredMediaId) {
            postData.featured_media = featuredMediaId;
        }

        try {
            const response = await axios.post(
                `${this.config.wordpress.url}/wp-json/wp/v2/posts`,
                postData,
                {
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': 'Basic ' + Buffer.from(`${this.config.wordpress.username}:${this.config.wordpress.appPassword}`).toString('base64')
                    },
                    timeout: 30000,
                    httpsAgent: agent
                }
            );

            this.database.publishedHashes.push(haber.hash);
            this.database.publishedUrls.push(haber.link);
            this.database.totalPublished++;
            this.database.history.push({
                id: response.data.id,
                title: haber.baslik,
                url: response.data.link,
                publishedAt: new Date().toISOString(),
                category: haber.kategori,
                source: haber.kaynak,
                importanceScore: haber.importanceScore
            });
            this.database.lastUpdate = new Date().toISOString();
            this.saveDatabase();

            this.stats.totalPublished++;

            console.log(`✅ [${haber.importanceScore}] ${haber.baslik.substring(0, 50)}...`);
            return { success: true, id: response.data.id, url: response.data.link };
        } catch (e) {
            this.stats.totalErrors++;
            console.log('❌ WordPress hatası:', e.response?.data?.message || e.message);
            return { success: false, error: e.response?.data?.message || e.message };
        }
    }

    async publishMultiple(haberler) {
        const results = [];

        for (let i = 0; i < haberler.length; i++) {
            const result = await this.publishToWordPress(haberler[i]);
            results.push({ haber: haberler[i].baslik, ...result });

            if (result.success && i < haberler.length - 1) {
                const randomDelay = (Math.floor(Math.random() * (this.config.settings.maxInterval - this.config.settings.minInterval + 1)) + this.config.settings.minInterval) * 60 * 1000;
                console.log(`⏳ ${Math.floor(randomDelay / 60000)} dakika ${Math.floor((randomDelay % 60000) / 1000)} saniye bekleniyor...`);
                await this.sleep(randomDelay);
            }
        }

        return results;
    }

    async run(options = {}) {
        console.log('🚀 WordPress haber botu başlatılıyor...\n');

        const haberler = await this.fetchAllSources(options);

        console.log(`📊 ${haberler.length} benzersiz haber bulundu (öncelik sırasına göre)\n`);

        if (haberler.length > 0) {
            const limit = options.limit || this.config.settings.maxHaberPerRun;
            const toPublish = haberler.slice(0, limit);

            console.log(`📤 ${toPublish.length} haber yayınlanacak (en önemliden başlayarak)...\n`);
            const results = await this.publishMultiple(toPublish);

            const successful = results.filter(r => r.success).length;
            const failed = results.filter(r => !r.success).length;

            console.log(`\n✅ Başarılı: ${successful}`);
            console.log(`❌ Başarısız: ${failed}`);
            console.log(`🔄 Tekrar: ${this.stats.totalDuplicates}`);
        }

        return {
            fetched: this.stats.totalFetched,
            published: this.stats.totalPublished,
            duplicates: this.stats.totalDuplicates,
            errors: this.stats.totalErrors
        };
    }

    async scheduledRun(options = {}) {
        console.log('\n' + '='.repeat(50));
        console.log('🔄 Zamanlanmış görev çalışıyor...');
        console.log(`⏰ ${new Date().toLocaleString('tr-TR')}`);
        console.log('='.repeat(50));

        try {
            await this.run(options);
        } catch (e) {
            console.log('❌ Hata:', e.message);
        }
    }

    startScheduler(options = {}) {
        console.log('⏰ Zamanlayıcı başlatıldı: İlk görev hemen çalışıyor\n');

        this.scheduledRun(options);

        console.log('\n✅ Bot 7/24 çalışmaya devam ediyor...');
        console.log('🛑 Durdurmak için CTRL+C yapın\n');

        setInterval(() => {}, 60000);
    }

    async testConnection() {
        console.log('🔍 Bağlantı test ediliyor...\n');

        const results = { wordpress: false, newsapi: false };

        try {
            const wpResponse = await axios.get(`${this.config.wordpress.url}/wp-json/wp/v2/posts`, {
                params: { per_page: 1 },
                headers: {
                    'Authorization': 'Basic ' + Buffer.from(`${this.config.wordpress.username}:${this.config.wordpress.appPassword}`).toString('base64')
                },
                timeout: 10000,
                httpsAgent: agent
            });
            results.wordpress = wpResponse.status === 200;
            console.log('✅ WordPress: Çalışıyor');
        } catch (e) {
            console.log('❌ WordPress hatası:', e.message);
        }

        try {
            const newsapiResponse = await axios.get(`${this.config.newsapi.baseUrl}/top-headlines`, {
                params: { country: 'tr', pageSize: 1, apiKey: this.config.newsapi.key },
                timeout: 10000,
                httpsAgent: agent
            });
            results.newsapi = newsapiResponse.data.status === 'ok';
            console.log('✅ NewsAPI: Çalışıyor');
        } catch (e) {
            console.log('❌ NewsAPI hatası:', e.message);
        }

        console.log('');
        return results;
    }
}

const bot = new WordPressHaberBotu({
    wordpressUrl: 'https://SENINSITEN.com',
    wpUsername: 'admin',
    wpAppPassword: 'xxxx xxxx xxxx xxxx xxxx xxxx',
    newsApiKey: '856ec0c76ffd4384a6ba17a6fb2b0c26',
    maxHaberPerRun: 2,
    autoPublish: false,
    sendImage: true,
    minInterval: 3,
    maxInterval: 6
});

(async () => {
    const test = await bot.testConnection();

    if (test.wordpress && test.newsapi) {
        await bot.startScheduler({
            newsapi: true,
            rss: true,
            categories: ['genel', 'teknoloji', 'ekonomi', 'spor', 'dunya', 'magazin', 'saglik'],
            limit: 2
        });
    } else {
        console.log('\n❌ Bağlantı hatası! Ayarları kontrol et.');
    }
})();

module.exports = WordPressHaberBotu;