import os
import json
import time
import hashlib
import requests
import feedparser
from datetime import datetime
from bs4 import BeautifulSoup
import logging
import urllib3
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler('telegram_bot.log', encoding='utf-8'),
        logging.StreamHandler()
    ]
)

class TelegramHaberBotu:
    def __init__(self, config):
        self.config = {
            'telegram': {
                'token': config['telegramToken'],
                'chat_id': config['chatId']
            },
            'newsapi': {
                'key': config.get('newsApiKey', '856ec0c76ffd4384a6ba17a6fb2b0c26'),
                'base_url': 'https://newsapi.org/v2'
            },
            'database': config.get('dbPath', 'telegram_haber_db.json'),
            'settings': {
                'haber_per_batch': config.get('haberPerBatch', 3),
                'batch_interval': config.get('batchInterval', 2),
                'message_delay': config.get('messageDelay', 5),
                'send_image': config.get('sendImage', True),
                'add_hashtags': config.get('addHashtags', True),
                'duplicate_check': config.get('duplicateCheck', True)
            }
        }
        
        retry_strategy = Retry(
            total=3,
            backoff_factor=1,
            status_forcelist=[429, 500, 502, 503, 504]
        )
        adapter = HTTPAdapter(max_retries=retry_strategy)
        self.session = requests.Session()
        self.session.mount("http://", adapter)
        self.session.mount("https://", adapter)
        self.session.verify = False
        
        self.telegram_api = f"https://api.telegram.org/bot{self.config['telegram']['token']}"
        self.database = self.load_database()
        self.stats = {
            'total_fetched': 0,
            'total_sent': 0,
            'total_duplicates': 0,
            'total_errors': 0,
            'start_time': time.time()
        }
        
        self.rss_kaynaklari = {
            'genel': [
                {'name': 'TRT Haber', 'url': 'https://www.trthaber.com/sondakika.rss', 'emoji': '🔴', 'priority': 1},
                {'name': 'NTV', 'url': 'https://www.ntv.com.tr/son-dakika.rss', 'emoji': '🔴', 'priority': 1},
                {'name': 'Hürriyet', 'url': 'https://www.hurriyet.com.tr/rss/anasayfa', 'emoji': '📰', 'priority': 2},
                {'name': 'Sözcü', 'url': 'https://www.sozcu.com.tr/rss/tum-haberler.xml', 'emoji': '📰', 'priority': 2},
                {'name': 'Cumhuriyet', 'url': 'https://www.cumhuriyet.com.tr/rss', 'emoji': '📰', 'priority': 2}
            ],
            'ekonomi': [
                {'name': 'Bloomberg HT', 'url': 'https://www.bloomberght.com/rss', 'emoji': '💰', 'priority': 3},
                {'name': 'NTV Ekonomi', 'url': 'https://www.ntv.com.tr/ekonomi.rss', 'emoji': '💰', 'priority': 3}
            ],
            'teknoloji': [
                {'name': 'Webtekno', 'url': 'https://www.webtekno.com/rss.xml', 'emoji': '💻', 'priority': 4},
                {'name': 'ShiftDelete', 'url': 'https://shiftdelete.net/feed', 'emoji': '💻', 'priority': 4},
                {'name': 'Technopat', 'url': 'https://www.technopat.net/feed/', 'emoji': '💻', 'priority': 4}
            ],
            'spor': [
                {'name': 'NTV Spor', 'url': 'https://www.ntvspor.net/son-dakika.rss', 'emoji': '⚽', 'priority': 5},
                {'name': 'Fanatik', 'url': 'https://www.fanatik.com.tr/rss', 'emoji': '⚽', 'priority': 5}
            ],
            'magazin': [
                {'name': 'Hürriyet Magazin', 'url': 'https://www.hurriyet.com.tr/rss/magazin', 'emoji': '🎬', 'priority': 7}
            ],
            'dunya': [
                {'name': 'BBC Türkçe', 'url': 'https://feeds.bbci.co.uk/turkce/rss.xml', 'emoji': '🌍', 'priority': 2}
            ],
            'saglik': [
                {'name': 'NTV Sağlık', 'url': 'https://www.ntv.com.tr/saglik.rss', 'emoji': '🏥', 'priority': 6}
            ]
        }
        
        self.category_hashtags = {
            'teknoloji': ['#teknoloji', '#tech', '#yapayZeka'],
            'ekonomi': ['#ekonomi', '#borsa', '#dolar'],
            'spor': ['#spor', '#futbol', '#basketbol'],
            'magazin': ['#magazin', '#ünlü', '#dizi'],
            'dunya': ['#dünya', '#gündem', '#politika'],
            'saglik': ['#sağlık', '#tıp'],
            'genel': ['#haber', '#gündem', '#türkiye']
        }
        
        self.importance_keywords = {
            'acil': ['vefat', 'öldü', 'hayatını kaybetti', 'deprem', 'patlama', 'yangın', 'saldırı', 'çatışma', 'bomba', 'terör', 'kaza', 'yaralandı', 'sel', 'afet', 'şehit'],
            'onemli': ['cumhurbaşkanı', 'başbakan', 'bakan', 'meclis', 'seçim', 'dolar', 'faiz', 'enflasyon', 'kriz', 'tcmb', 'operasyon', 'gözaltı'],
            'gundem': ['ankara', 'istanbul', 'tbmm', 'anayasa mahkemesi', 'chp', 'ak parti', 'mhp']
        }

    def load_database(self):
        try:
            if os.path.exists(self.config['database']):
                with open(self.config['database'], 'r', encoding='utf-8') as f:
                    data = json.load(f)
                    if 'sent_hashes' not in data:
                        data['sent_hashes'] = []
                    if 'sent_urls' not in data:
                        data['sent_urls'] = []
                    if 'history' not in data:
                        data['history'] = []
                    return data
        except Exception as e:
            logging.warning(f'Database yüklenemedi: {e}')
        
        return {
            'sent_hashes': [],
            'sent_urls': [],
            'history': [],
            'total_sent': 0,
            'last_update': None
        }

    def save_database(self):
        try:
            if len(self.database['sent_hashes']) > 5000:
                self.database['sent_hashes'] = self.database['sent_hashes'][-2500:]
                self.database['sent_urls'] = self.database['sent_urls'][-2500:]
            
            with open(self.config['database'], 'w', encoding='utf-8') as f:
                json.dump(self.database, f, ensure_ascii=False, indent=2)
        except Exception as e:
            logging.error(f'Database kaydedilemedi: {e}')

    def generate_hash(self, text):
        if not text:
            return hashlib.md5(str(time.time()).encode()).hexdigest()
        return hashlib.md5(text.lower().strip().encode('utf-8')).hexdigest()

    def clean_text(self, text):
        if not text:
            return ''
        
        try:
            if 'Ä' in text or 'Ã' in text:
                text = text.encode('cp1254').decode('utf-8', errors='ignore')
        except:
            pass
        
        try:
            text = text.encode('latin1').decode('utf-8', errors='ignore')
        except:
            pass
        
        soup = BeautifulSoup(text, 'html.parser')
        cleaned = soup.get_text()
        cleaned = cleaned.replace('\xa0', ' ').replace('\n', ' ').replace('\r', ' ')
        cleaned = ' '.join(cleaned.split())
        
        replacements = {
            'Ä±': 'ı', 'ÄŸ': 'ğ', 'Ã§': 'ç', 'Ã¶': 'ö', 'Ã¼': 'ü', 'ÅŸ': 'ş',
            'Ä°': 'İ', 'Ã‡': 'Ç', 'Ã–': 'Ö', 'Ãœ': 'Ü',
            'BakanlÄ±ÄŸÄ±': 'Bakanlığı', 'DepartmanÄ±': 'Departmanı',
            'DirektÃ¶rÃ¼': 'Direktörü', 'fiyatlarÄ±n': 'fiyatların',
            'yÃ¼kselmesi': 'yükselmesi', 'Rusya\'nÄ±n': 'Rusya\'nın',
            'ihracatÄ±na': 'ihracatına', 'hÄ±zlÄ±ca': 'hızlıca',
            'getirebileceÄŸini': 'getirebileceğini', 'sÃ¶yledi': 'söyledi',
            'Ã§arpÄ±ÅŸtÄ±ÄŸÄ±': 'çarpıştığı', 'Ã§arpÄ±ÅŸmasÄ±': 'çarpışması',
            'kiÅŸi': 'kişi', 'hayatÄ±nÄ±': 'hayatını', 'Ã¶ldÃ¼': 'öldü'
        }
        
        for wrong, correct in replacements.items():
            cleaned = cleaned.replace(wrong, correct)
        
        return cleaned

    def calculate_importance(self, haber):
        text = (haber.get('baslik', '') + ' ' + haber.get('ozet', '')).lower()
        importance_score = 0
        
        for keyword in self.importance_keywords['acil']:
            if keyword in text:
                importance_score += 100
        for keyword in self.importance_keywords['onemli']:
            if keyword in text:
                importance_score += 50
        for keyword in self.importance_keywords['gundem']:
            if keyword in text:
                importance_score += 25
        
        if haber.get('kategori') == 'genel':
            importance_score += 10
        elif haber.get('kategori') == 'dunya':
            importance_score += 8
        elif haber.get('kategori') == 'ekonomi':
            importance_score += 5
        
        importance_score += (10 - haber.get('source_priority', 5)) * 3
        
        time_diff = self.get_time_diff(haber.get('tarih'))
        if time_diff < 30:
            importance_score += 20
        elif time_diff < 60:
            importance_score += 10
        
        return importance_score

    def get_time_diff(self, date_str):
        try:
            if not date_str:
                return 9999
            pub_date = datetime.fromisoformat(date_str.replace('Z', '+00:00'))
            now = datetime.now(pub_date.tzinfo)
            return (now - pub_date).total_seconds() / 60
        except:
            return 9999

    def detect_category(self, text):
        if not text:
            return 'genel'
        
        text_lower = text.lower()
        category_keywords = {
            'teknoloji': ['apple', 'google', 'microsoft', 'samsung', 'iphone', 'android', 'yazılım', 'yapay zeka', 'ai'],
            'ekonomi': ['dolar', 'euro', 'borsa', 'faiz', 'enflasyon', 'tcmb', 'bitcoin', 'kripto'],
            'spor': ['futbol', 'basketbol', 'maç', 'gol', 'transfer', 'galatasaray', 'fenerbahçe', 'beşiktaş'],
            'magazin': ['ünlü', 'şarkıcı', 'oyuncu', 'dizi', 'film'],
            'saglik': ['sağlık', 'doktor', 'covid', 'aşı'],
            'dunya': ['abd', 'avrupa', 'rusya', 'çin', 'savaş']
        }
        
        max_score = 0
        detected = 'genel'
        
        for category, keywords in category_keywords.items():
            score = sum(1 for keyword in keywords if keyword in text_lower)
            if score > max_score:
                max_score = score
                detected = category
        
        return detected

    def is_duplicate(self, haber):
        if not haber or 'hash' not in haber:
            return True
        if haber['hash'] in self.database['sent_hashes']:
            return True
        if haber.get('link') and haber['link'] in self.database['sent_urls']:
            return True
        return False

    def fetch_newsapi(self):
        try:
            url = f"{self.config['newsapi']['base_url']}/top-headlines"
            params = {
                'country': 'tr',
                'pageSize': 20,
                'apiKey': self.config['newsapi']['key']
            }
            
            response = self.session.get(url, params=params, timeout=15, verify=False)
            data = response.json()
            
            if data.get('status') == 'ok' and 'articles' in data:
                haberler = []
                for article in data['articles']:
                    if not article or not article.get('title'):
                        continue
                    
                    haberler.append({
                        'baslik': self.clean_text(article['title']),
                        'ozet': self.clean_text(article.get('description', '')),
                        'link': article.get('url', ''),
                        'resim': article.get('urlToImage'),
                        'kaynak': article.get('source', {}).get('name', 'NewsAPI'),
                        'tarih': article.get('publishedAt', datetime.now().isoformat()),
                        'kategori': self.detect_category(article['title']),
                        'hash': self.generate_hash(article['title']),
                        'source_priority': 1
                    })
                return haberler
        except Exception as e:
            logging.error(f'NewsAPI hatası: {e}')
        return []

    def fetch_rss(self, source):
        try:
            response = self.session.get(source['url'], timeout=15, verify=False)
            feed = feedparser.parse(response.content)
            haberler = []
            
            for item in feed.entries[:15]:
                if not item or not hasattr(item, 'title'):
                    continue
                
                resim = None
                try:
                    if hasattr(item, 'media_content') and item.media_content:
                        resim = item.media_content[0].get('url')
                    elif hasattr(item, 'enclosures') and item.enclosures:
                        resim = item.enclosures[0].get('href')
                    
                    if not resim and hasattr(item, 'summary'):
                        soup = BeautifulSoup(item.summary, 'html.parser')
                        img = soup.find('img')
                        if img:
                            resim = img.get('src')
                except:
                    pass
                
                haberler.append({
                    'baslik': self.clean_text(item.title),
                    'ozet': self.clean_text(getattr(item, 'summary', '')),
                    'link': getattr(item, 'link', ''),
                    'resim': resim,
                    'kaynak': source['name'],
                    'tarih': getattr(item, 'published', datetime.now().isoformat()),
                    'kategori': self.detect_category(item.title),
                    'hash': self.generate_hash(item.title),
                    'emoji': source.get('emoji', '📰'),
                    'source_priority': source.get('priority', 5)
                })
            
            return haberler
        except Exception as e:
            logging.error(f"RSS hatası ({source['name']}): {e}")
        return []

    def fetch_all_sources(self):
        all_haberler = []
        
        newsapi_haberler = self.fetch_newsapi()
        all_haberler.extend(newsapi_haberler)
        
        for category in self.rss_kaynaklari.values():
            for source in category:
                haberler = self.fetch_rss(source)
                all_haberler.extend(haberler)
                time.sleep(0.3)
        
        return self.process_haberler(all_haberler)

    def process_haberler(self, haberler):
        processed = []
        seen_hashes = set()
        
        for haber in haberler:
            if not haber or 'hash' not in haber or 'baslik' not in haber:
                continue
            if haber['hash'] in seen_hashes:
                continue
            if self.config['settings']['duplicate_check'] and self.is_duplicate(haber):
                self.stats['total_duplicates'] += 1
                continue
            if len(haber['baslik']) < 10:
                continue
            
            haber['importance_score'] = self.calculate_importance(haber)
            seen_hashes.add(haber['hash'])
            processed.append(haber)
        
        processed.sort(key=lambda x: x['importance_score'], reverse=True)
        self.stats['total_fetched'] += len(processed)
        return processed

    def format_message(self, haber):
        emoji = haber.get('emoji', '📰')
        if haber['importance_score'] >= 100:
            emoji = '🚨'
        elif haber['importance_score'] >= 50:
            emoji = '🔴'
        
        hashtags = ''
        if self.config['settings']['add_hashtags']:
            category_tags = self.category_hashtags.get(haber['kategori'], self.category_hashtags['genel'])
            hashtags = ' '.join(category_tags[:3])
        
        message = f"{emoji} <b>{haber['baslik']}</b>\n\n"
        
        if haber.get('ozet') and len(haber['ozet']) > 20:
            ozet = haber['ozet'][:300] + '...' if len(haber['ozet']) > 300 else haber['ozet']
            message += f"{ozet}\n\n"
        
        message += f"📌 <b>Kaynak:</b> {haber['kaynak']}\n"
        message += f"🔗 <a href=\"{haber['link']}\">Haberin Devamı</a>\n"
        
        if hashtags:
            message += f"\n{hashtags}"
        
        return message

    def send_to_telegram(self, haber):
        try:
            message = self.format_message(haber)
            url = f"{self.telegram_api}/sendMessage"
            
            if self.config['settings']['send_image'] and haber.get('resim'):
                try:
                    url = f"{self.telegram_api}/sendPhoto"
                    data = {
                        'chat_id': self.config['telegram']['chat_id'],
                        'photo': haber['resim'],
                        'caption': message,
                        'parse_mode': 'HTML'
                    }
                    response = self.session.post(url, data=data, timeout=30, verify=False)
                    response.raise_for_status()
                except:
                    url = f"{self.telegram_api}/sendMessage"
                    data = {
                        'chat_id': self.config['telegram']['chat_id'],
                        'text': message,
                        'parse_mode': 'HTML',
                        'disable_web_page_preview': False
                    }
                    response = self.session.post(url, data=data, timeout=30, verify=False)
                    response.raise_for_status()
            else:
                data = {
                    'chat_id': self.config['telegram']['chat_id'],
                    'text': message,
                    'parse_mode': 'HTML',
                    'disable_web_page_preview': False
                }
                response = self.session.post(url, data=data, timeout=30, verify=False)
                response.raise_for_status()
            
            self.database['sent_hashes'].append(haber['hash'])
            self.database['sent_urls'].append(haber['link'])
            self.database['total_sent'] += 1
            self.database['last_update'] = datetime.now().isoformat()
            self.save_database()
            
            self.stats['total_sent'] += 1
            logging.info(f"✅ [{haber['importance_score']}] {haber['baslik'][:50]}...")
            return True
        except Exception as e:
            self.stats['total_errors'] += 1
            logging.error(f"❌ Telegram hatası: {e}")
            return False

    def run_forever(self):
        logging.info('🚀 Bot başlatıldı - SÜREKLI çalışacak!')
        logging.info(f'⏰ Her {self.config["settings"]["batch_interval"]} dakikada {self.config["settings"]["haber_per_batch"]} haber\n')
        
        while True:
            try:
                logging.info('\n' + '='*50)
                logging.info(f'🔄 {datetime.now().strftime("%Y-%m-%d %H:%M:%S")}')
                logging.info('='*50)
                
                haberler = self.fetch_all_sources()
                logging.info(f'📊 {len(haberler)} haber bulundu\n')
                
                if haberler:
                    to_send = haberler[:self.config['settings']['haber_per_batch']]
                    logging.info(f'📤 {len(to_send)} haber gönderiliyor...\n')
                    
                    for i, haber in enumerate(to_send):
                        success = self.send_to_telegram(haber)
                        if success and i < len(to_send) - 1:
                            time.sleep(self.config['settings']['message_delay'])
                    
                    logging.info(f'\n📊 Toplam: {self.database["total_sent"]} haber gönderildi')
                else:
                    logging.info('❌ Yeni haber yok\n')
                
                logging.info(f'⏳ {self.config["settings"]["batch_interval"]} dakika bekleniyor...\n')
                time.sleep(self.config['settings']['batch_interval'] * 60)
                
            except KeyboardInterrupt:
                logging.info('\n\n🛑 Bot durduruldu!')
                break
            except Exception as e:
                logging.error(f'❌ Hata: {e}')
                logging.info('⏳ 30 saniye sonra tekrar deneniyor...\n')
                time.sleep(30)

if __name__ == '__main__':
    bot = TelegramHaberBotu({
        'telegramToken': '8792482220:AAFsn2Enii2QqVWzv4G5TOKlE25tAAYxwug',
        'chatId': '-1003892722496',
        'newsApiKey': '856ec0c76ffd4384a6ba17a6fb2b0c26',
        'haberPerBatch': 3,
        'batchInterval': 2,
        'messageDelay': 5,
        'sendImage': True,
        'addHashtags': True
    })
    
    bot.run_forever()
