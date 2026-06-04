// Export_Live2D_Layers.jsx
// 用于一键自动化导出 Live2D 项目所需的标准分层 PNG
// 在 Photoshop 中打开 PSD → 文件 → 脚本 → 浏览 → 选择此文件

#target photoshop

function main() {
    if (!documents.length) {
        alert("请先在 Photoshop 中打开您的 Live2D 设计原稿 (PSD)！");
        return;
    }

    var doc = activeDocument;
    var outputFolder = Folder.selectDialog("请选择用于存放 public/live2d/ 拆单 PNG 的目标文件夹");
    if (outputFolder == null) return;

    var options = new ExportOptionsSaveForWeb();
    options.format = SaveDocumentType.PNG;
    options.PNG8 = false; // PNG-24 保证 Flat 色彩高保真
    options.transparency = true;

    function exportLayerGroups(obj) {
        for (var i = 0; i < obj.layers.length; i++) {
            var layer = obj.layers[i];
            if (layer.typename == "LayerSet") {
                exportLayerGroups(layer);
            } else {
                if (layer.visible) {
                    hideAllLayers(doc);
                    layer.visible = true;
                    makeParentVisible(layer);

                    var safeName = layer.name.toLowerCase().replace(/[^a-z0-9_]/g, "_");
                    var file = new File(outputFolder + "/" + safeName + ".png");

                    doc.exportDocument(file, ExportType.SAVEFORWEB, options);
                }
            }
        }
    }

    exportLayerGroups(doc);
    alert("Live2D 图层自动化拆单完成！资产已成功放入指定目录。");
}

function hideAllLayers(doc) {
    for (var i = 0; i < doc.layers.length; i++) {
        doc.layers[i].visible = false;
    }
}

function makeParentVisible(layer) {
    var p = layer.parent;
    while (p && p.typename == "LayerSet") {
        p.visible = true;
        p = p.parent;
    }
}

main();
