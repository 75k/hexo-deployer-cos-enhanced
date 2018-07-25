'use strict';
const fs    = require('hexo-fs');
const COS   = require('cos-nodejs-sdk-v5');
const util  = require('./util.js');
const path  = require('path');
const chalk = require('chalk');
const QCSDK = require('./qcloud');

module.exports = function(args) {
    let cfgs = checkConfigs(this.config);
    if (!cfgs) return;

    let publicDir = this.public_dir;
    let localFileMap = new Map();
    let localImgsMap = new Map();
    

    if (!cfgs.cdnEnable) {
        //CDN功能未开启,开始获取 publicDir目录中的文件
        getFiles(publicDir, (file) => {
            localFileMap.set(getUploadPath(file), path.join(publicDir, file));
        })
    } else {
        let uploadDir = path.join(this.base_dir, '.coscache');
        let strRegExp = '(src="|content="|href=")([^"]*?\/' + cfgs.cdnConfig.folder + '\/)([^"]*?[\.jpg|\.jpeg|\.png|\.gif|\.zip]")';
        let imgRegExp = new RegExp(strRegExp, 'gi');
        // 获取本地文件
        getFiles(publicDir, (file) => {
            if (file.match(cfgs.cdnConfig.folder)) {
                //如果是图片目录，写入 localImgsMap 对象
                localImgsMap.set(getUploadPath(file).replace(cfgs.cdnConfig.folder + '\/', ''), path.join(publicDir, file));
            } else {
                //如果不是图片目录，开始下一步过滤
                if (file.match(/\.html$/)) {
                    //如果是 HTML文件，开始读取文件
                    let data = fs.readFileSync(path.join(publicDir, file));
                    if (imgRegExp.test(data)) {
                        //如果正则匹配，开始替换原路径为临时路径
                        var i = 0;
                        data = data.replace(imgRegExp, function(all,before, main, after) {
                            i++;
                            return before + cfgs.cdnConfig.cdnUrl + after;
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

    function cosStart(fileMap, cfgs, cdn) {
        if (fileMap.size < 1) {
            if (cdn === false) {
                console.log(chalk.red('本地文件获取失败！'));
            } else {
                console.log(chalk.red('没有需要上传到 CDN 的文件！'));
            }
            return;
        }
        console.log(chalk.cyan('本地文件准备就绪，正在从' + cfgs.bucket + '获取远程文件列表..'));
        const cos = new COS({
            SecretId: cfgs.secretId,
            SecretKey: cfgs.secretKey
        });
        return getCosFiles(cos, cfgs)
        .then(cosFileMap => {
            if (cosFileMap.size > 0) {
                console.log(chalk.cyan('获取远程文件成功，开始对比本地文件和远程文件..'));
            } else {
                console.log(chalk.cyan('远程仓库为空，开始上传全部文件..'));
            }
            return diffFileList(fileMap, cosFileMap);
        })
        .then(allFiles => {
            return deleteFile(cos, cfgs, allFiles.extraFiles)
            .then(function(data) {
                if (data != false) {
                    console.log(chalk.cyan('删除远程多余文件成功，开始上传本地文件..'));
                }
                return allFiles;
            })
            .catch(err => {
                console.log(err);
            })
        })
        .then(allFiles => {
            return uploadFile(cos, cfgs, allFiles.uploadFiles)
            .then(function(data) {
                if (data === 'ok') {
                    console.log(chalk.cyan('上传完成！'));
                }
                return allFiles.uploadFiles;
            })
            .then((filesMap) => {
                return cacheRefresh(cfgs, filesMap)
                .then((res) => {
                    if (res != false) {
                        console.log(chalk.cyan('更新缓存完成！'));
                    }
                })
            })
            .catch(err => {
                console.log(chalk.red('更新缓存失败！'));
                console.log(err);
            })
        })
        .catch(err => {
            console.log(chalk.red('获取远程文件失败！'));
            console.log(err);
        })
    }

    return cosStart(localFileMap, cfgs, false)
    .then(function() {
        return cosStart(localImgsMap, cfgs.cdnConfig, true)
    })
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
 * @return {string}
 */
function getUploadPath(absPath) {
    return absPath.split(path.sep).join('/');
}

/**
 * 更新CDN缓存
 * @param  {[type]} cfgs     [description]
 * @param  {[type]} filesMap [description]
 * @return {[type]}          [description]
 */
function cacheRefresh(cfgs, filesMap) {
    QCSDK.config({
        secretId: cfgs.secretId,
        secretKey: cfgs.secretKey
    })
    return new Promise((resolve, reject) => {
        if (filesMap.size === 0) {
            resolve(false);
        }
        var i = 0;
        var urls = {};
        filesMap.forEach( (file, filePath) => {
            urls['urls.' + i] = encodeURI(cfgs.cdnUrl + filePath);
            ++i;
        });
        QCSDK.request('RefreshCdnUrl', urls, (res) => {
            res = JSON.parse(res);
            if (res.codeDesc === 'Success') {
                resolve(true);
            } else {
                reject(res);
            }
        })
    })
}

/**
 * 获取 Bucket 中的文件数据
 * @param {object} cos
 * @param {object} cfgs
 */
function getCosFiles(cos, cfgs) {
    return new Promise((resolve, reject) => {
        cos.getBucket({
            Bucket: cfgs.bucket,
            Region: cfgs.region
        }, (err, data) => {
            let cosFileMap = new Map();
            if (err) {
                reject(err)
            } else {
                data.Contents.forEach((item) => {
                    cosFileMap.set(
                        item.Key,
                        item.ETag
                    );
                });
                resolve(cosFileMap)
            }
        })
    })
}

/**
 * 比较本地文件和远程文件
 * @param  {[type]} localFileMap [本地文件]
 * @param  {[type]} cosFileMap   [远程文件]
 * @return {[type]}              [返回上传文件列表和远程多余文件列表]
 */
function diffFileList (localFileMap, cosFileMap) {
    let extraFiles = [];
    return new Promise((resolve, reject) => {
        if (cosFileMap.size < 1) {
            resolve ({
                extraFiles: extraFiles,
                uploadFiles: localFileMap
            })
        }
        var i = 0;
        cosFileMap.forEach(async (eTag, key) => {
            if (!localFileMap.has(key)) {
                extraFiles.push({Key: key});
            } else {
                await diffMd5(localFileMap.get(key)).then((md5) => {
                    if (md5 === eTag.substring(1, 33)) {
                        localFileMap.delete(key);
                    }
                })
            }
            ++i;
            if (i === cosFileMap.size) {
                resolve ({
                    extraFiles: extraFiles,
                    uploadFiles: localFileMap
                })
            }
        })
    })
}

function putObject(cos, config, file, filePath) {
    return new Promise((resolve, reject) => {
        cos.putObject({
            Bucket: config.bucket,
            Region: config.region,
            Key: file,
            Body: fs.createReadStream(filePath),
            ContentLength: fs.statSync(filePath).size,
            onProgress: function (progressData) {
                //console.log(JSON.stringify(progressData));
            },
        }, (err, data) => {
            if (err) {
                reject(err);
            } else {
                resolve(data);
            }
        })
    })
}

/**
 * upload file
 * @param {object} cos
 * @param {object} config
 * @param {object} file
 */
function uploadFile (cos, config, files) {
    return new Promise((resolve, reject) => {
        if (!files || files.size < 1) {
            console.log(chalk.cyan('没有新的文件需要上传！'));
            resolve()
        }
        var i = 0;
        files.forEach(async (file, filePath) => {
            await putObject(cos, config, filePath, file)
            .then(() => {
                console.log(chalk.green('成功上传：' + filePath));
            })
            .catch(err => {
                console.log(chalk.red('上传失败！' + filePath));
                console.log(err);
            })
            ++i;
            if (i === files.size) {
                resolve('ok')
            }
        })
    })
}

/**
 * 从远程仓库删除多余文件
 * @param {object} cos
 * @param {object} config
 * @param {Array} fileList
 */
function deleteFile (cos, config, fileList) {
    return new Promise((resolve, reject) => {
        if (fileList.length < 1) {
            resolve(false)
        }
        cos.deleteMultipleObject({
            Bucket: config.bucket,
            Region: config.region,
            Objects: fileList
        }, (err, data) => {
            if (err) {
                reject(err)
            } else {
                resolve(data)
            }
        })
    })
}

/**
 * 对比本地和远程文件的 MD5值
 * @param  {[type]} file [文件路径]
 * @return {[type]}      [description]
 */
function diffMd5(file) {
    return new Promise((resolve, reject) => {
        util.getFileMd5(fs.createReadStream(file), (err, md5) => {
            if (err) {
                reject(err)
            } else {
                resolve(md5);
            }
        })
    })
}

/**
 * 检查并处理设置项
 * @param  {[type]} config [hexo设置项]
 * @return {[type]}        [description]
 */
function checkConfigs(config) {
    let cfgs = config.deploy;
    cfgs.cdnUrl = config.url.replace(/([^\/])$/, "$1\/");
    if (!cfgs.cdnUrl || !cfgs.bucket || !cfgs.region || !cfgs.secretId || !cfgs.secretKey) {
        let tips = [
            chalk.red('由于配置错误，部署到 腾讯云COS 失败！'),
            '请检查根目录下的 _config.yml 文件中是否设置了以下信息',
            'url: http://yoursite.com',
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
        if (!cfgs.cdnConfig) {
            cfgs.cdnEnable = false;
            return cfgs;
        } else {
            if (!cfgs.cdnConfig.enable) {
                cfgs.cdnEnable = false;
                return cfgs;
            } else {
                if (!cfgs.cdnConfig.cdnUrl || !cfgs.cdnConfig.bucket || !cfgs.cdnConfig.region || !cfgs.cdnConfig.folder || !cfgs.cdnConfig.secretId || !cfgs.cdnConfig.secretKey) {
                    let tips = [
                        chalk.red('您开启了 CDN功能，但是配置错误！'),
                        '请检查根目录下的 _config.yml 文件中是否设置了以下信息',
                        'deploy:',
                        '  type: cos',
                        '  bucket: yourBucket',
                        '  region: yourRegion',
                        '  secretId: yourSecretId',
                        '  secretKey: yourSecretKey',
                        '  cdnConfig:',
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
                    cfgs.cdnEnable = true;
                    cfgs.cdnConfig.cdnUrl = cfgs.cdnConfig.cdnUrl.replace(/([^\/])$/, "$1\/");
                    return cfgs;
                }
            }
        }
    }
}