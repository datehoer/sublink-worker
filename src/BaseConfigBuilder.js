import { ProxyParser } from './ProxyParsers.js';
import { DeepCopy, decodeBase64 } from './utils.js';
import { t, setLanguage } from './i18n/index.js';
import { generateRules, getOutbounds, PREDEFINED_RULE_SETS } from './config.js';

export class BaseConfigBuilder {
    constructor(inputString, selectedRules, customRules, baseConfig, lang, userAgent, excludedProtocols = [], excludedSSMethods = '', nameFilterRegex = '') {
        this.inputString = inputString;
        this.selectedRules = selectedRules;
        this.customRules = customRules;
        this.baseConfig = baseConfig;
        this.lang = lang;
        this.userAgent = userAgent;
        this.excludedProtocols = excludedProtocols;
        this.excludedSSMethods = excludedSSMethods ? excludedSSMethods.split(',').map(method => method.trim().toLowerCase()) : [];
        this.nameFilterRegex = nameFilterRegex;
        setLanguage(lang);
    }

    async build() {
        const customItems = await this.parseCustomItems();
        this.addCustomItems(customItems);
        this.addSelectors();
        return this.formatConfig();
    }

    async parseCustomItems() {
        const urls = this.inputString.split('\n').filter(url => url.trim() !== '');
        const parsedItems = [];
        
        for (const url of urls) {
            // Try to decode if it might be base64
            let processedUrls = this.tryDecodeBase64(url);
            
            // Handle single URL or array of URLs
            if(!Array.isArray(processedUrls)){
                processedUrls = [processedUrls];
            }

            // Handle multiple URLs from a single base64 string
            for (const processedUrl of processedUrls) {
                const result = await ProxyParser.parse(processedUrl, this.userAgent);
                if (Array.isArray(result)) {
                    for (const subUrl of result) {
                        const subResult = await ProxyParser.parse(subUrl, this.userAgent);
                        if (subResult) {
                            parsedItems.push(subResult);
                        }
                    }
                } else if (result) {
                    parsedItems.push(result);
                }
            }
        }
        
        return parsedItems;
    }

    tryDecodeBase64(str) {
        // If the string already has a protocol prefix, return as is
        if (str.includes('://')) {
            return str;
        }

        try {
            // Try to decode as base64
            const decoded = decodeBase64(str);
            
            // Check if decoded content contains multiple links
            if (decoded.includes('\n')) {
                // Split by newline and filter out empty lines
                const multipleUrls = decoded.split('\n').filter(url => url.trim() !== '');
                
                // Check if at least one URL is valid
                if (multipleUrls.some(url => url.includes('://'))) {
                    return multipleUrls;
                }
            }
            
            // Check if the decoded string looks like a valid URL
            if (decoded.includes('://')) {
                return decoded;
            }
        } catch (e) {
            // If decoding fails, return original string
        }
        return str;
    }

    getOutboundsList() {
        let outbounds;
        if (typeof this.selectedRules === 'string' && PREDEFINED_RULE_SETS[this.selectedRules]) {
            outbounds = getOutbounds(PREDEFINED_RULE_SETS[this.selectedRules]);
        } else if (this.selectedRules && Object.keys(this.selectedRules).length > 0) {
            outbounds = getOutbounds(this.selectedRules);
        } else {
            outbounds = getOutbounds(PREDEFINED_RULE_SETS.minimal);
        }
        return outbounds;
    }

    getProxyList() {
        return this.getProxies().map(proxy => this.getProxyName(proxy));
    }

    getProxies() {
        throw new Error('getProxies must be implemented in child class');
    }

    getProxyName(proxy) {
        throw new Error('getProxyName must be implemented in child class');
    }

    convertProxy(proxy) {
        throw new Error('convertProxy must be implemented in child class');
    }

    addProxyToConfig(proxy) {
        throw new Error('addProxyToConfig must be implemented in child class');
    }

    addAutoSelectGroup(proxyList) {
        throw new Error('addAutoSelectGroup must be implemented in child class');
    }

    addNodeSelectGroup(proxyList) {
        throw new Error('addNodeSelectGroup must be implemented in child class');
    }

    addOutboundGroups(outbounds, proxyList) {
        throw new Error('addOutboundGroups must be implemented in child class');
    }

    addCustomRuleGroups(proxyList) {
        throw new Error('addCustomRuleGroups must be implemented in child class');
    }

    addFallBackGroup(proxyList) {
        throw new Error('addFallBackGroup must be implemented in child class');
    }

    addCustomItems(customItems) {
        const validItems = customItems.filter(item => item != null);
        
        // Filter out excluded protocols
        const filteredItems = validItems.filter(item => {
            if (!item?.type) return true;
            
            // Check excluded protocols
            if (this.excludedProtocols.includes(item.type)) {
                return false;
            }
            
            // Check excluded SS methods for ShadowSocks
            if (item.type === 'shadowsocks' && this.excludedSSMethods.length > 0) {
                const method = item.method ? item.method.toLowerCase() : '';
                if (this.excludedSSMethods.includes(method)) {
                    return false;
                }
            }
            
            // Check name filter regex
            if (this.nameFilterRegex) {
                const name = item.tag || '';
                const nameFilters = this.nameFilterRegex.split(',').map(s => s.trim()).filter(s => s);
                const matches = nameFilters.some(pattern => {
                    try {
                      const regex = new RegExp(pattern, 'i');
                      return regex.test(name);
                    } catch (e) {
                      console.warn(`Invalid regex pattern: ${pattern}`, e);
                      return false;
                    }
                  });
                if (matches) {
                    return false;
                }
            }
            return true;
        });
        
        filteredItems.forEach(item => {
            if (item?.tag) {
                const convertedProxy = this.convertProxy(item);
                if (convertedProxy) {
                    this.addProxyToConfig(convertedProxy);
                }
            }
        });
    }

    addSelectors() {
        const outbounds = this.getOutboundsList();
        const proxyList = this.getProxyList();

        this.addAutoSelectGroup(proxyList);
        this.addNodeSelectGroup(proxyList);
        this.addOutboundGroups(outbounds, proxyList);
        this.addCustomRuleGroups(proxyList);
        this.addFallBackGroup(proxyList);
    }

    generateRules() {
        return generateRules(this.selectedRules, this.customRules);
    }

    formatConfig() {
        throw new Error('formatConfig must be implemented in child class');
    }
}
