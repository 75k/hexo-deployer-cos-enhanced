'use strict';
const fs    = require('hexo-fs');
const COS   = require('cos-nodejs-sdk-v5');
const util  = require('./util.js');
const path  = require('path');
const chalk = require('chalk');
const QCSDK = require('qcloud-cdn-node-sdk');

module.exports = function(args) {
    let cfgs = checkConfigs(this.config);
    let publicDir = this.public_dir;
    let localFileMap = new Map();
    if (!cfgs) return;

    if (!cfgs.cdn_cos.enable) {
        //CDN功能未开启
    } else {
        let localImgsMap = new Map();
        let uploadDir = path.join(this.base_dir, '.coscache');
        let imgReg = '(src="|content="|href=")([^"]*?\/' + cfgs.cdn_cos.folder + '\/)([^"]*?[\.jpg|\.jpeg|\.png|\.gif|\.zip]")';
        let imgExp = new RegExp(imgReg, 'gi');
        // 获取本地文件
        getFiles(publicDir, (file) => {
            if (file.match(cfgs.cdn_cos.folder)) {
                //如果是图片目录，写入 localImgsMap 对象
                localImgsMap.set(getUploadPath(file), path.join(publicDir, file));
            } else {
                //如果不是图片目录，开始下一步过滤
                if (file.match(/\.html$/)) {
                    //如果是 HTML文件，开始读取文件
                    let data = fs.readFileSync(path.join(publicDir, file));
                    if (imgExp.test(data)) {
                        //如果正则匹配，开始替换原路径为临时路径
                        var i = 0;
                        data = data.replace(imgExp, function(all,before, main, after) {
                            i++;
                            return before + cfgs.cdn_cos.cdnUrl + after;
                        });
                        //将替换完成的数据，写入临时目录
                        fs.writeFileSync(path.join(uploadDir, file), data);
                        //将临时路径，写入Map对象
                        localFileMap.set(getUploadPath(file), path.join(uploadDir, file));
                        console.log(chalk.green('替换 ' + i + '处 相对路径 为 CDN路径，所属文件：' + path.join(uploadDir, file)));
                    } else {
                        //如果正则不匹配，直接写入原路径
                        localFileMap.set(getUploadPath(file), path.join(publicDir, file));
                    }
                } else {
                    //如果不是 HTML文件，直接写入原路径
                    localFileMap.set(getUploadPath(file), path.join(publicDir, file));
                }
            }
        });
    }
    console.log(localFileMap)
}

/**
 * 遍历目录，获取文件列表
 * @param {string} dir
 * @param {function}  callback
 */
function getFiles(dir, callback) {
    fs.listDirSync(dir).forEach((filePath) => {
        callback(filePath);
    });
}

/**
 * 获取上传文件的路径
 * @param {string} absPath
 * @param {string} root
 * @return {string}
 */
function getUploadPath(absPath) {
    return absPath.split(path.sep).join('/');
}

/**
 * 检查并处理设置项
 * @param  {[type]} config [hexo设置项]
 * @return {[type]}        [description]
 */
function checkConfigs(config) {
    if (!config.deploy) {
        console.log(chalk.red('Error：部署信息配置错误！'));
        return false;
    } else {
        let cfgs = config.deploy;
        cfgs.url = config.url.replace(/([^\/])$/, "$1\/");
        if (!cfgs.url || !cfgs.bucket || !cfgs.region || !cfgs.secretId || !cfgs.secretKey) {
            let tips = [
                chalk.red('由于配置错误，部署到 腾讯云COS 失败！'),
                '请检查根目录下的 _config.yml 文件中是否设置了以下信息',
                'deploy:',
                '  type: cos',
                '  bucket: yourBucket',
                '  region: yourRegion',
                '  secretId: yourSecretId',
                '  secretKey: yourSecretKey',
                '',
                '您还可以访问插件仓库，以获取详细说明： ' + chalk.underline('https://github.com/75k/hexo-deployer-cos-enhanced')
            ]
            console.log(tips.join('\n'));
            return false;
        } else {
            if (!cfgs.cdn_cos.enable) {
                return cfgs;
            } else {
                if (!cfgs.cdn_cos.cdnUrl || !cfgs.cdn_cos.bucket || !cfgs.cdn_cos.region || !cfgs.cdn_cos.folder || !cfgs.cdn_cos.secretId || !cfgs.cdn_cos.secretKey) {
                    let tips = [
                        chalk.red('您开启了 CDN功能，但是配置错误！'),
                        '请检查根目录下的 _config.yml 文件中是否设置了以下信息',
                        'deploy:',
                        '  type: cos',
                        '  bucket: yourBucket',
                        '  region: yourRegion',
                        '  secretId: yourSecretId',
                        '  secretKey: yourSecretKey',
                        '  cdn_cos:',
                        '    enable: true',
                        '    cdnUrl: yourCdnUrl',
                        '    bucket: yourBucket',
                        '    region: yourRegion',
                        '    folder: yourImgsFolder',
                        '    secretId: yourSecretId',
                        '    secretKey: yourSecretKey',
                        '',
                        '您还可以访问插件仓库，以获取详细说明： ' + chalk.underline('https://github.com/75k/hexo-deployer-cos-enhanced')
                    ]
                    console.log(tips.join('\n'));
                    return false;
                } else {
                    cfgs.cdn_cos.cdnUrl = cfgs.cdn_cos.cdnUrl.replace(/([^\/])$/, "$1\/");
                    return cfgs;
                }
            }
        }
    }
}