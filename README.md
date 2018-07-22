# hexo-deployer-cos-enhanced

Hexo静态博客部署到腾讯云对象存储服务的插件，部署完成后会自动刷新被更新文件的CDN缓存。同时支持图片文件上传到单独对象存储中。

## 声明

**上传的时候，会自动清理远程bucket中的多余文件，请谨慎使用！**

** 更新 CDN缓存需要授权，如果使用子账号，请同时赋予该账号此权限！**

**目前在 macOS High Sierra 和 Windows10系统上测试通过，其他系统欢迎反馈。**

## 优点

1. 编辑博文时，可以实时预览插入的图片（使用 VSCode 和 它的 Paste Image 插件）。
2. 本地 `hexo s` 时，可以正常查看博文中插入的本地图片。
3. 最大化的利用腾讯云对象存储服务提供的免费额度（可以用两个腾讯云账号，一个放网站文件，一个放图片等文件）。
4. 存放图片的COS仓库，可以设置防盗链了。全放在一个仓库的话，是不能设置防盗链的哦。
5. 全站CDN，速度快到没朋友。

## 缺点

1. 必须备案！必须备案！必须备案！重要的事儿说三遍！
2. 超出免费额度要付费。只要不受到攻击，能把免费额度用光，也算本事了。

## 安装方法

``` bash
#稳定版
npm install hexo-deployer-cos-enhanced --save
```

``` bash
#开发版
npm install https://github.com/75k/hexo-deployer-cos-enhanced.git --save
```

## 配置

``` yml
url: http://yourSite.com
deploy: 
  type: cos
  bucket: blog-1251123456
  region: ap-shanghai
  secretId: AKIDIgxxxxxxxxxxxxxxxxxxxx0SepjX
  secretKey: qXPCbxxxxxxxxxxxxxxxxxxxxsJZfdR
    cdnConfig:
      enable: true
      cdnUrl: http://yourCdnSite.com
      bucket: static-1251123456
      region: ap-shanghai
      folder: static-1251123456
      secretId: AKIDIgxxxxxxxxxxxxxxxxxxxx0SepjX
      secretKey: qXPCbxxxxxxxxxxxxxxxxxxxxsJZfdR
```

`type`： 是固定死的，只能是 cos。

`cdnUrl`： 是你的对象存储绑定的CDN域名，没有启用 CDN的话，推荐使用 [https://github.com/sdlzhd/hexo-deployer-cos](https://github.com/sdlzhd/hexo-deployer-cos)

`bucket` 和 `region`： 在腾讯云的对象存储中，新建或找到你的 bucket，然后找到 **默认域名** 信息，会看到一个类似这样的域名: `blog-1251123456.cos.ap-shanghai.myqcloud.com`，第一个点前面的 `blog-1251123456` 就是 `bucket` 名称，第二个点和第三个点之间的 `ap-shanghai`，就是你的 COS 所在地域，填写到 `region` 中。

`secretId` 和 `secretKey`：在 COS控制台中，找到左侧的**密钥管理**，点进去，按照提示添加子账号，并设置秘钥。同时要给子账号赋予 COS相关的权限，还有CDN刷新的权限。不会配置的可以参考 [官方示例](https://cloud.tencent.com/document/product/228/14867)


**懒得写了，其他的自行研究吧。**



## 使用 VSCode 优雅的写 HExo博文

VSCode 安装 `Paste Image` 插件：

Paste Image插件配置

```
"pasteImage.path": "${projectRoot}/source/static-1251123456/${currentFileNameWithoutExt}",
"pasteImage.basePath": "${projectRoot}/source",
"pasteImage.forceUnixStyleSeparator": true,
"pasteImage.prefix": "../",
```

**注意第一行代码中的 `static-1251123456` ,这个是存放图片的目录，要跟上面配置文件中的 `folder: static-1251123456` 对应起来**

经过以上配置以后，在 VSCode中编辑 MarkDown可以预览图片，本地 `hexo s`的时候，同样可以预览本地图片。`hexo d` 部署以后，图片会被自动上传到腾讯云对象存储中。再也不用为图片问题烦恼了。

## License

MIT

根据这个插件修改的：[https://github.com/sdlzhd/hexo-deployer-cos](https://github.com/sdlzhd/hexo-deployer-cos)，修改过程中学到了很多东西，感谢~~~