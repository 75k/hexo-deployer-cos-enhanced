'use strict';
const Q      = require('q');
const fs     = require('hexo-fs');
const COS    = require('cos-nodejs-sdk-v5');
const util   = require('./util.js');
const path   = require('path');
const chalk  = require('chalk');
const QCSDK  = require('qcloud-cdn-node-sdk');
const Events = require('events');

module.exports = function (args) {
    // 检查部署配置项
    if (!args.bucket ||
        !args.region ||
        !args.cdnUrl ||
        !args.secretId ||
        !args.secretKey) {
        console.log(chalk.red('配置信息错误！请参阅: https://github.com/75k/hexo-deployer-cos-enhanced'));
        return;
    }
    // 网址末尾加斜杠 /
    args.cdnUrl = args.cdnUrl.replace(/([^\/])$/, "$1\/");
    
    // 变量声明
    let publicDir = this.public_dir;
    let localFileMap = new Map();

    // 获取本地文件
    getFiles(publicDir, (file) => {
        localFileMap.set(
            getUploadPath(file, path.basename(publicDir)),
            file
        );
    });

    // 创建COS对象
    const cos = new COS({
        SecretId: args.secretId,
        SecretKey: args.secretKey
    });

    // 获取COS上的文件
    getCosFiles(cos, {
        bucket: args.bucket,
        region: args.region,
    }, (err, cosFileMap) => {
        if (err) {
            console.log(chalk.red(err));
        } else {
            let sum = cosFileMap.size;
            if (sum === 0) {
                // 上传所有文件
                upload(cos, args, localFileMap, function(err, res) {
                    if (err) {
                        console.log(chalk.red(err));
                    } else {
                       res = JSON.parse(res);
                       if ( res.codeDesc == 'Success' ) {
                           console.log(chalk.green('成功更新 ' + res.data.count + ' 条CDN缓存'));
                           console.log(chalk.cyan('全部操作完成！'));
                       } else {
                           console.log(chalk.red(res.message));
                       } 
                   }
                });
            } else {
                let count = 0;
                let extraFiles = [];
                const iteratorEmitter = new Events();

                cosFileMap.forEach((eTag, key) => {
                    if (!localFileMap.has(key)) {
                        // 放入待删除的文件列表,计数器+1
                        extraFiles.push(key);
                        ++count;
                        if (count === sum) {
                            iteratorEmitter.emit('finshed');
                        }
                    } else {
                        // 获取此文件的md5
                        util.getFileMd5(
                            fs.createReadStream(localFileMap.get(key)),
                            (err, md5) => {
                                if (md5 === eTag.substring(1, 33)) {
                                    // 从本地文件列表移除,计数器+1
                                    localFileMap.delete(key);
                                    ++count;
                                    if (count === sum) {
                                        iteratorEmitter.emit('finshed');
                                    }
                                } else {
                                    // 计数器+1
                                    ++count;
                                    if (count === sum) {
                                        iteratorEmitter.emit('finshed');
                                    }
                                }
                            });
                    }
                });

                iteratorEmitter.on('finshed', () => {
                    // 开始上传本地文件,并且删除多余的文件
                    if (localFileMap.size > 0) {
                        upload(cos, args, localFileMap, function(err, res) {
                            if (err) {
                                console.log(chalk.red(err));
                            } else {
                                res = JSON.parse(res);
                                if ( res.codeDesc == 'Success' ) {
                                    console.log(chalk.green('成功更新 ' + res.data.count + ' 条CDN缓存'));
                                    // 删除多余的文件
                                    if (extraFiles.length > 0) {
                                        console.log(chalk.cyan('准备删除远程仓库中的多余文件...'));
                                        deleteObject(cos, args, extraFiles, function(err,fulfilled) {
                                            if (err) {
                                                console.log(chalk.red(err));
                                            } else {
                                                console.log(chalk.green('成功从远程仓库删除 ' + fulfilled.length + ' 个多余文件'));
                                                console.log(chalk.cyan('全部操作完成！'));
                                            }
                                        });
                                    } else {
                                        console.log(chalk.cyan('全部操作完成！'));
                                    }
                                } else {
                                    console.log(chalk.red(res.message));
                                }
                            }
                        });
                    } else {
                        console.log(chalk.red('没有新的文件需要部署！'));
                        // 删除多余的文件
                        if (extraFiles.length > 0) {
                            console.log(chalk.cyan('准备删除远程仓库中的多余文件...'));
                            deleteObject(cos, args, extraFiles, function(err,fulfilled) {
                                if (err) {
                                    console.log(chalk.red(err));
                                } else {
                                    console.log(chalk.green('成功从远程仓库删除 ' + fulfilled.length + ' 个多余文件'));
                                    console.log(chalk.cyan('全部操作完成！'));
                                }
                            });
                        }
                    }
                });
            }
        }
    });
}

/**
 * 遍历目录，获取文件列表
 * @param {string} dir
 * @param {function}  callback
 */
function getFiles(dir, callback) {
    fs.listDirSync(dir).forEach((filePath) => {
        callback(path.join(dir, filePath));
    });
}

/**
 * 获取上传文件的路径
 * @param {string} absPath
 * @param {string} root
 * @return {string}
 */
function getUploadPath(absPath, root) {
    let pathArr = absPath.split(path.sep);
    let rootIndex = pathArr.indexOf(root);
    pathArr = pathArr.slice(rootIndex + 1);
    return pathArr.join('/');
}

/**
 * 获取 cos 上的所有文件
 * @param {object} cos
 * @param {object} config
 * @param {function} callback
 */
function getCosFiles(cos, config, callback) {
    cos.getBucket({
        Bucket: config.bucket,
        Region: config.region,
    }, (err, data) => {
        let cosFileMap = new Map();
        if (err) {
            console.log(chalk.red(err));
            return;
        }
        data.Contents.forEach((item) => {
            cosFileMap.set(
                item.Key,
                item.ETag
            );
        });
        callback(err, cosFileMap);
    });
}

/**
 * 上传文件到 COS
 * @param  {[object]}   cos          [cos对象]
 * @param  {[object]}   config       [配置信息]
 * @param  {[object]}   localFileMap [本地文件列表]
 * @param  {Function} callback       [description]
 * @return {[object]}                [err]
 */
function upload(cos, config, localFileMap, callback) {
    let url  = 0;
    let urls = {};
    let tasks = [];
    // 创建CDN对象
    QCSDK.config({
        secretId: config.secretId,
        secretKey: config.secretKey
    });
    localFileMap.forEach((filepath, file) => {
        urls['urls.'+url] = config.cdnUrl+file;
        url++;
        var handler = function() {
            var defer = Q.defer();
            putFile();
            function putFile() {
                cos.putObject({
                    Bucket: config.bucket,
                    Region: config.region,
                    Key: file,
                    ContentLength: fs.statSync(filepath).size,
                    Body: fs.createReadStream(filepath),
                    onProgress(progressData) {
                        console.log(chalk.yellow(filepath + '上传进度：' + parseInt(progressData.percent*100) + '%'));
                    },
                }, function (err, data) {
                    if (err) {
                        console.log(chalk.red(err));
                        defer.reject();
                    } else {
                        console.log(chalk.green('成功上传 ' + filepath));
                        defer.resolve();
                    }
                });
            }
            return defer.promise;
        };
        tasks.push(handler());
    });

    if (tasks.length !== 0) {
      Q.allSettled(tasks)
        .then(function(fulfilled) {
            console.log(chalk.cyan('上传完成，准备更新CDN缓存...'));
            QCSDK.request('RefreshCdnUrl', urls, (res) => {
                callback(null,res);
            });
        }, function(err) {
          console.log(chalk.red(err));
          callback(err,null);
        });
    }
}

/**
 * 删除COS中的多余文件
 * @param  {[type]}   cos        [description]
 * @param  {[type]}   config     [description]
 * @param  {[type]}   extraFiles [description]
 * @param  {Function} callback   [description]
 * @return {[type]}              [description]
 */
function deleteObject(cos, config, extraFiles, callback) {
    let tasks = [];
    extraFiles.forEach((file) => {
        var handler = function () {
            var defer = Q.defer();
            deleteObject();
            function deleteObject() {
                cos.deleteObject({
                    Bucket: config.bucket,
                    Region: config.region,
                    Key: file,
                }, (err, data) => {
                    if (err) {
                        console.log(chalk.red(err));
                        defer.reject();
                    } else {
                        console.log(chalk.green('成功删除: ' + file));
                        defer.resolve();
                    }
                });
            }
            return defer.promise;
        };
        tasks.push(handler());
    });
    if (tasks.length !== 0) {
      Q.allSettled(tasks)
        .then(function(fulfilled) {
            callback(null,fulfilled);
        }, function(err) {
            callback(err,null);
        });
    }
}