# hexo-deployer-cos-enhanced

Hexo静态博客部署到腾讯云对象存储服务的插件，部署完成后会自动刷新被更新文件的CDN缓存。

## 声明

**上传的时候，会自动清理远程bucket中的多余文件，请谨慎使用！**

**目前仅在 Windows10系统上测试通过，其他系统欢迎反馈。**

新手学习中，有问题欢迎反馈，不保证一定能解决哈。

## 安装方法

```
npm install git+https://github.com/75k/hexo-deployer-cos-enhanced.git --save
```

## 配置

``` yml
deploy: 
  type: cos
  cdnUrl: https://static.xxx.com
  bucket: blog-1251123456
  region: ap-shanghai
  secretId: AKIDIgxxxxxxxxxxxxxxxxxxxx0SepjX
  secretKey: qXPCbxxxxxxxxxxxxxxxxxxxxsJZfdR
```

`type`： 是固定死的，只能是 cos。

`cdnUrl`： 是你的对象存储绑定的CDN域名，没有启用 CDN的话，推荐使用 [https://github.com/sdlzhd/hexo-deployer-cos](https://github.com/sdlzhd/hexo-deployer-cos)

`bucket` 和 `region`： 在腾讯云的对象存储中，新建或找到你的 bucket，然后找到 **默认域名** 信息，会看到一个类似这样的域名: `blog-1251123456.cos.ap-shanghai.myqcloud.com`，第一个点前面的 `blog-1251123456` 就是 `bucket` 名称，第二个点和第三个点之间的 `ap-shanghai`，就是你的 COS 所在地域，填写到 `region` 中。

`secretId` 和 `secretKey`：在 COS控制台中，找到左侧的**密钥管理**，点进去，按照提示添加子账号，并设置秘钥。同时要给子账号赋予 COS相关的权限，还有CDN刷新的权限。不会配置的可以参考 [官方示例](https://cloud.tencent.com/document/product/228/14867)



## 使用 VSCode 优雅的写 HExo博文

VSCode 安装两个插件：

1. vscode-hexo
2. Paste Image

Paste Image插件配置

```
"pasteImage.path": "${projectRoot}/source/imgs/${currentFileNameWithoutExt}",
"pasteImage.basePath": "${projectRoot}/source",
"pasteImage.forceUnixStyleSeparator": true,
"pasteImage.prefix": "../",
```

经过以上配置以后，在 VSCode中编辑 MarkDown可以预览图片，本地 `hexo s`的时候，同样可以预览本地图片。`hexo d` 部署以后，图片会被自动上传到腾讯云对象存储中。再也不用为图片问题烦恼了。

## License

MIT

根据这个插件修改的：[https://github.com/sdlzhd/hexo-deployer-cos](https://github.com/sdlzhd/hexo-deployer-cos)，修改过程中学到了很多东西，感谢~~~