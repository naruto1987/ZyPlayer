import Base64 from 'crypto-js/enc-base64';
import Utf8 from 'crypto-js/enc-utf8';
import jsonpath from 'jsonpath';
import PQueue from 'p-queue';

import { updateHistory, detailHistory, addHistory } from '@/api/history';
import { detailStar, addStar, delStar, updateStar } from '@/api/star';
import { fetchAnalyzePlay } from '@/api/analyze';
import { setT3Proxy } from '@/api/proxy';
import { fetchDrpyPlayUrl, fetchHipyPlayUrl, fetchT3PlayUrl, t3RuleProxy, t3RuleInit, catvodRuleInit, fetchDetail, fetchSearch, fetchCatvodPlayUrl, fetchDoubanRecommend } from '@/utils/cms';
import sniffer from '@/utils/sniffer';
import { checkMediaType, dictDeepClone, getConfig } from '@/utils/tool';

const queue = new PQueue({ concurrency: 5 }); // 设置并发限制为5

// 官解地址
const VIP_LIST = [
  "iqiyi.com",
  "iq.com",
  "mgtv.com",
  "qq.com",
  "youku.com",
  "le.com",
  "sohu.com",
  "pptv.com",
  "bilibili.com",
  "tudou.com"
];

// Binge
const fetchBingeData = async (relateId: string, videoId: number): Promise<{ status: boolean; data: any }> => {
  try {
    const response = await detailStar({ relateId, videoId });
    return {
      status: Boolean(response), // 直接转换为布尔值
      data: response || {}, // 如果response存在则使用response，否则使用空对象
    };
  } catch (err) {
    console.error(`[film_common][fetchBingeData]`, err); // 更详细的错误日志
    return {
      status: false,
      data: {},
    };
  }
};

const putBingeData = async (action: string, id: any = null, doc: any = {}): Promise<{ status: boolean; data: any }> => {
  try {
    let res = {};
    if (action === 'add') {
      res = await addStar(doc);
    } else if (action === 'del') {
      res = await delStar(id);
    } else if (action === 'update') {
      res = await updateStar(id, doc);
    }
    return {
      status: true,
      data: res
    };
  } catch (err) {
    console.error(`[film_common][putBingeData]`, err);
    return {
      status: false,
      data: {},
    };
  }
};

// History
const fetchHistoryData = async (relateId: string, videoId: number) => {
  console.log('[film_common][fetchHistoryData][start]历史获取流程开启');
  let data: any = {
    id: null,
    date: 1715018234,
    type: "film",
    relateId: "",
    siteSource: "",
    playEnd: false,
    videoId: "",
    videoImage: "",
    videoName: "",
    videoIndex: "",
    watchTime: 0,
    duration: null,
    skipTimeInStart: 30,
    skipTimeInEnd: 30,
  };

  try {
    const response = await detailHistory({ relateId, videoId });
    if (response) data = response;
    console.log(`[film_common][fetchHistoryData][return]`, data);
  } catch (err) {
    console.error(`[film_common][fetchHistoryData][error]`, err);
  } finally {
    console.log(`[film_common][fetchHistoryData][end]历史获取流程结束`);
    return data;
  };
};

const putHistoryData = async (id: any = null, doc: any = {}): Promise<void> => {
  // console.log('[film_common][putHistoryData][start]历史更新流程开启');
  let data: any = {
    id: null,
    date: 1715018234,
    type: "film",
    relateId: "",
    siteSource: "",
    playEnd: false,
    videoId: "",
    videoImage: "",
    videoName: "",
    videoIndex: "",
    watchTime: 0,
    duration: null,
    skipTimeInStart: 30,
    skipTimeInEnd: 30,
  };

  try {
    if (id) {
      data = await updateHistory(id, doc);
    } else {
      data = await addHistory(doc);
    }
    // console.log(`[film_common][putHistoryData][return]`, data);
  } catch (err) {
    console.log(`[film_common][putHistoryData][error]` ,err);
  } finally {
    // console.log(`[film_common][putHistoryData][end]历史更新流程结束`);
    return data;
  }
};

// Analyze
const fetchAnalyzeData = async (): Promise<{ default: any; flag: any[]; active: any[] }> => {
  console.log('[film_common][fetchAnalyzeData][start]开始获取解析数据流程');
  let data: { default: any; flag: any[]; active: any[] } = { default: {}, flag: [], active: [] };

  try {
    const response = await fetchAnalyzePlay();
    data = {
      default: response.default || {},
      flag: response.flag || [],
      active: response.active || []
    };
    console.log(`[film_common][fetchAnalyzeData][return]`, data);
  } catch (err) {
    console.error(`[film_common][fetchAnalyzeData][error]`, err);
  } finally {
    console.log('[film_common][fetchAnalyzeData][end]获取解析数据流程结束');
    return data;
  }
};

/**
 * playHelper
 *
 * 1.源带 playurl
 * 2.drpy hipy t3 catvod [存在处理完后是官解]
 * 3.官解 爱优腾域名 及 线路flag [存在非http开头]
 * 4.资源类型判断 -> 直链 > 兜底嗅探
 *
 * 所有链接都必须获得mediaType, 播放器需根据mediaType识别, 重要
 *
 * @param snifferMode 嗅探数据 type url
 * @param url 播放链接
 * @param site 源信息
 * @param analyze 解析 url type flag
 * @param flimSource 当前选中线路
 * @returns
 */
const playHelper = async (snifferMode, url: string, site, analyze, flimSource) => {
  console.log(`[film_common][playHelper][start]播放处理流程开始`);
  console.log(`[film_common][playHelper][url]${url}`);

  let data: { url: string; mediaType: string | null, isOfficial: boolean } = { url: '', mediaType: '', isOfficial: false };

  try {
    let playerUrl = url;
    let script: string = '';
    let extra: string = '';
    let isOfficial: boolean = false;
    let parse = true;
    let playData: any = { playUrl: url, script: '',extra: '', parse: parse};

    // 解析播放
    const jxPlay = async (url: string, analyze: any, snifferMode: any): Promise<any> => {
      let playerUrl = url;
      const urlObj = url.startsWith('http') ? new URL(url) : null;
      const hostname = urlObj?.hostname;

      // 官方解析条件
      const isOfficial = (hostname && (VIP_LIST.some(host => hostname.includes(host))) || analyze.flag.some(flag => flimSource.includes(flag)));

      // 官方解析地址
      const officialSnifferUrl = isOfficial && analyze.url ? `${analyze.url}${url}` : '';

      // 预处理嗅探URL
      const preSnifferUrl = officialSnifferUrl;

      if (preSnifferUrl) {
        switch (analyze.type) {
          case 1: // JSON类型
            playerUrl = await fetchJxJsonPlayUrlHelper(analyze.url, url);
            break;
          case 0: // Web类型
            const snifferApi = snifferMode.type === 'custom' && /^http/.test(snifferMode.url)
              ? new URL(snifferMode.url).origin + new URL(snifferMode.url).pathname
              : '';
            playerUrl = await fetchJxWebPlayUrlHelper(snifferMode.type, `${snifferApi}?url=${preSnifferUrl}`);
            break;
          default: // 不支持的解析类型处理
            console.warn(`[film_common][playHelper][warn]不支持的解析类型: ${analyze.type}`);
        }
      }

      return {
        url: playerUrl || url,
        isOfficial: isOfficial
      };
    }

    if (site.playUrl) {
      playerUrl = await fetchJxJsonPlayUrlHelper(site.playUrl, url);
    } else {
      switch (site.type) {
        case 2:
          // drpy免嗅
          playerUrl = await fetchDrpyPlayUrlHelper(site, url);
          break;
        case 6:
          // hipy获取服务端播放链接
          playData = await fetchHipyPlayUrlHelper(site, flimSource, url);
          playerUrl = playData.playUrl;
          script = playData.script;
          extra = playData.extra;
          parse = playData.parse;
          break;
        case 7:
          // t3获取服务端播放链接
          await t3RuleInit(site);
          playData = await fetchT3PlayUrlHelper(flimSource, url, []);
          playerUrl = playData.playUrl;
          script = playData.script;
          extra = playData.extra;
          parse = playData.parse;
          break;
        case 8:
          // catvox获取服务端播放链接
          await catvodRuleInit(site);
          playerUrl = await fetchCatvodPlayUrlHelper(site, flimSource, url);
          break;
      }
      if (!playerUrl) playerUrl = url; // 可能出现处理后是空链接
      if (analyze?.url) {
        const resJX = await jxPlay(playerUrl, analyze, snifferMode);
        playerUrl = resJX.url;
        isOfficial = resJX.isOfficial;
      }
    }

    if (playerUrl) {
      const mediaType = await checkMediaType(playerUrl);
      if (mediaType !== 'unknown' && mediaType !== 'error') {
        data = { url: playerUrl, mediaType, isOfficial };
        return;
      }
    }

    // 兜底办法:嗅探
    console.log(`[film_common][playHelper][reveal]尝试提取播放链接`);

    // 自定义嗅探器并且链接正确才有嗅探器api接口前缀
    const snifferApi = snifferMode.type === 'custom' && /^http/.test(snifferMode.url)
      ? new URL(snifferMode.url).origin + new URL(snifferMode.url).pathname
      : '';

    const snifferPlayUrl = `${snifferApi}?url=${playerUrl}&script=${script}${extra}`;
    data.url = await sniffer(snifferMode.type, snifferPlayUrl);
    data.mediaType = 'm3u8';
    data.isOfficial = false;

    console.log(`[film_common][playHelper][return]`, data);
  } catch (err) {
    console.error(`[film_common][playHelper][error]`, err);
  } finally {
    console.log(`[film_common][playHelper][end]播放处理流程结束`);
    return data;
  };
};

// EeverseOrder
const reverseOrderHelper = (action: 'positive' | 'negative', data: Record<string, any[]>): Record<string, any[]> => {
  const newData = dictDeepClone(data);

  if (action === 'positive') {
    console.log('[film_common][reverseOrderHelper]正序');
  } else {
    console.log('[film_common][reverseOrderHelper]倒序');
    Object.keys(newData).forEach(key => newData[key].reverse());
  }
  console.log(newData)
  return newData;
};

// DouBan Recommend
const fetchDoubanRecommendHelper = async (site: any, info: any): Promise<any[]> => {
  console.log('[film_common][fetchDoubanRecommendHelper][start]获取豆瓣推荐流程开启');
  let data: any = [];

  try {
    if (site.search !== 0) {
      const { vod_name: name, vod_year: year, vod_douban_id: doubanId } = info;
      const recommendNames = await fetchDoubanRecommend(doubanId, name, year);

      if (site.type === 7) await t3RuleInit(site);
      else if(site.type ===8) await catvodRuleInit(site);

      console.log(recommendNames)
      // 并行查询搜索结果
      const searchPromises = recommendNames.map(title =>
        queue.add(async () => {
          try {
            const results = await fetchSearch(site, title);
            console.log(results[0])
            return results?.[0];
          } catch (error) {
            console.error(`[film_common][fetchDoubanRecommendHelper][searchError]搜索错误: ${title}`, error);
            return false; // 处理错误，返回null表示无效结果
          }
        })
      );

      const searchResults = await Promise.all(searchPromises);

      console.log(searchResults)

      data = searchResults.filter(Boolean).slice(0, 10);

      if (data && data.length > 0 && !('vod_pic' in data[0])) {
        if ([0, 1].includes(site.type)) {
          const ids = data.map((item) => item.vod_id);
          data = await fetchDetail(site, ids.join(','));
        } else {
          const updatePromises = data.map(item =>
            queue.add(async () => {
              try {
                const detail = await fetchDetail(site, item.vod_id);
                return detail[0];
              } catch (error) {
                console.error(`[film_common][fetchDoubanRecommendHelper][detailError]获取详情错误: ${item.vod_id}`, error);
                return null;
              }
            })
          );
          data = await Promise.all(updatePromises).then(results => results.filter(Boolean));
        }
      }

      // 过滤掉无效结果，最多保留10个有效结果
      data = data.filter(Boolean).slice(0, 10);
    }

    console.log(`[film_common][fetchDoubanRecommendHelper][return]`, data);
  } catch (err) {
    console.log(`[film_common][fetchDoubanRecommendHelper][error]`, err);
  } finally {
    console.log(`[film_common][fetchDoubanRecommendHelper][end]获取豆瓣推荐流程结束`);
    return data;
  }
};

// Helper functions
const fetchHipyPlayUrlHelper = async (site: { [key: string]: any }, flag: string, url: string): Promise<{ playUrl: string; script: string; extra: string; parse: boolean }> => {
  console.log('[film_common][fetchHipyPlayUrlHelper][start]获取服务端播放链接开启');
  let data: { playUrl: string; script: string; extra: string; parse: boolean } = { playUrl: '', script: '', extra: '', parse: false };

  try {
    const playRes = await fetchHipyPlayUrl(site, flag, url);
    data = {
      playUrl: playRes.url,
      script: playRes.js ? Base64.stringify(Utf8.parse(playRes.js)) : '',
      extra: playRes.parse_extra || '',
      parse: Boolean(playRes.parse),
    };
    console.log(`[film_common][fetchHipyPlayUrlHelper][return]`, data);
  } catch (err) {
    console.log(`[film_common][fetchHipyPlayUrlHelper][error]`, err);
  } finally {
    console.log(`[film_common][fetchHipyPlayUrlHelper][end]获取服务端播放链接结束`);
    return data;
  };
};

const fetchT3PlayUrlHelper = async (flag: string, id: string, flags: string[] = []): Promise<{ playUrl: string; script: string; extra: string; parse: boolean }> => {
  console.log('[film_common][fetchT3PlayUrlHelper][start]获取服务端播放链接开启');
  let data: { playUrl: string; script: string; extra: string; parse: boolean } = { playUrl: '', script: '', extra: '', parse: false };
  try {
    const playRes = await fetchT3PlayUrl(flag, id, flags);
    if (playRes?.parse === 0 && playRes?.url.indexOf('http://127.0.0.1:9978/proxy') > -1) {
      const proxyRes: any = await t3RuleProxy(playRes.url);
      await setT3Proxy(proxyRes);
    };

    data = {
      playUrl: playRes.url,
      script: playRes.js ? Base64.stringify(Utf8.parse(playRes.js)) : '',
      extra: playRes.parse_extra || '',
      parse: Boolean(playRes.parse),
    };
    console.log(`[film_common][fetchT3PlayUrlHelper][return]`, data);
  } catch (err) {
    console.log(`[film_common][fetchT3PlayUrlHelper][error]`, err);
  } finally {
    console.log(`[film_common][fetchT3PlayUrlHelper][end]获取服务端播放链接结束`);
    return data;
  };
};

const fetchCatvodPlayUrlHelper = async (site: { [key: string]: any }, flag: string, id: string): Promise<string> => {
  console.log('[film_common][fetchCatvodPlayUrlHelper][start]获取服务端播放链接开启');
  let data: string = '';
  try {
    const res = await fetchCatvodPlayUrl(site, flag, id);
    data = res.url;
    console.log(`[film_common][fetchCatvodPlayUrlHelper][return]`, data);
  } catch (err) {
    console.log(`[film_common][fetchCatvodPlayUrlHelper][error]`, err);
  } finally {
    console.log(`[film_common][fetchCatvodPlayUrlHelper][end]获取服务端播放链接结束`);
    return data;
  };
};

const fetchDrpyPlayUrlHelper = async (site: { [key: string]: any }, url: string): Promise<string> => {
  console.log('[film_common][fetchDrpyPlayUrlHelper][start]免嗅流程开启');
  let data: string = '';
  try {
    const res = await fetchDrpyPlayUrl(site, url);
    if (res.redirect) {
      data = res.url;
      console.log(`[film_common][fetchDrpyPlayUrlHelper][return]`, data);
    };
  } catch (err) {
    console.log(`[film_common][fetchDrpyPlayUrlHelper][error]`, err);
  } finally {
    console.log(`[film_common][fetchDrpyPlayUrlHelper][end]免嗅流程结束`);
    return data;
  };
};

const fetchJxJsonPlayUrlHelper = async (playUrl: string, url: string): Promise<string> => {
  console.log('[film_common][fetchJxJsonPlayUrlHelper][start]json解析流程开启');
  let data: string = '';
  try {
    const res = await getConfig(`${playUrl}${url}`);
    // 存在 url data.url 两种结构
    if (jsonpath.value(res, '$.url')) {
      data = jsonpath.value(res, '$.url');
      console.log(`[film_common][fetchJxJsonPlayUrlHelper][return]`, data);
    };
  } catch (err) {
    console.log(`[film_common][fetchJxJsonPlayUrlHelper][error]`, err);
  } finally {
    console.log(`[film_common][fetchJxJsonPlayUrlHelper][end]json解析流程结束`);
    return data;
  }
};

const fetchJxWebPlayUrlHelper = async (type: string, url: string): Promise<string> => {
  console.log('[detail][fetchJxWebPlayUrlHelper][start]官解流程开启');
  let data: string = '';
  try {
    const res = await sniffer(type, url);
    data = res;
    console.log(`[film_common][fetchJxWebPlayUrlHelper][return]`, data);
  } catch (err) {
    console.log(`[film_common][fetchJxWebPlayUrlHelper][error]`, err);
  } finally {
    console.log(`[film_common][fetchJxWebPlayUrlHelper][end]官解流程结束`);
    return data;
  };
};

// 格式化剧集名称
const formatName = (item: string): string => {
  const [first] = item.split('$');
  return first.includes('http') ? '正片' : first;
};

// 格式化剧集集数
const formatIndex = (item: string): { index: string, url: string} => {
  const [index, url] = item.split('$');
  return { index, url };
};

// 格式化style
const formatContent = (item: string | undefined | null): string => {
  if (!item) return '';
  return item!.replace(/style\s*?=\s*?([‘"])[\s\S]*?\1/gi, '');
};

// 获取播放源及剧集
const formatSeason = (videoList: Record<string, any>): Record<string, any> => {
  console.log('[film_common][formatSeason][start]剧集格式化流程开启');
  let data: any = {
    '报错': ['格式化报错$f12查看更多报错信息']
  };
  try {
    // 分离播放源
    const playFrom = videoList["vod_play_from"];
    const playSources = playFrom.split('$').filter(Boolean);

    // 处理剧集信息，同时修复缺失'$'的条目
    const playUrl = videoList["vod_play_url"];
    const episodesBySource = playUrl.split('$$$') // 分离不同播放源的剧集信息
      .map(sourceEpisodes =>
        sourceEpisodes
          // 修复剧集格式，确保每个条目都包含'$'
          .replace(/\$+/g, '$') // 确保'$'不重复
          .split('#')
          .map(episode => episode.includes('$') ? episode : `正片$${episode}`)
      );

    // 构建完整列表
    const fullList: Record<string, string[]> = playSources.reduce((acc, source, index) => {
      acc[source] = episodesBySource[index];
      return acc;
    }, {});

    data = fullList;
    console.log(`[film_common][formatSeason][return]`, data);
  } catch (err) {
    console.log(`[film_common][formatSeason][error]`, err);
  } finally {
    console.log(`[film_common][formatSeason][end]剧集格式化流程结束`);
    return data;
  };
};

// 格式化倒序集数
const formatReverseOrder = (action: 'positive' | 'negative', current: number, total: number) => {
  // 当前 0 总 37 正序 1 倒序 37
  // 当前 1 总 37 正序 2 倒序 36
  if (action === 'positive') return current + 1;
  else if (action === 'negative') return total - current;
  return 1;
};

export {
  VIP_LIST,
  fetchBingeData,
  putBingeData,
  fetchHistoryData,
  putHistoryData,
  fetchAnalyzeData,
  playHelper,
  reverseOrderHelper,
  fetchDoubanRecommendHelper,
  formatName,
  formatIndex,
  formatContent,
  formatSeason,
  formatReverseOrder
}
