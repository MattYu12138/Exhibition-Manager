// Keep existing Chinese API messages for legacy clients while serving readable
// English diagnostics to users who selected English in Warehouse Manager.
const messages = {
  '请填写用户名和密码': 'Enter your username and password.',
  '用户名或密码错误': 'Incorrect username or password.',
  '您没有访问仓库管理系统的权限，请联系管理员': 'You do not have access to Warehouse Manager. Contact an administrator.',
  '您没有访问仓库管理系统的权限': 'You do not have access to Warehouse Manager.',
  '您没有写入权限，请联系管理员': 'You do not have write access. Contact an administrator.',
  '需要管理员权限': 'Administrator access is required.',
  'session 保存失败': 'Could not save the sign-in session.',
  '未登录': 'Please sign in.',
  '用户不存在': 'The user no longer exists.',
  '缺少 SSO token': 'SSO token is missing.',
  'SSO 验证失败': 'SSO verification failed.',
  'SSO 服务连接失败': 'Could not connect to the sign-in service.',
  'token 申请失败': 'Could not request a sign-in token.',
  '布局不存在': 'Warehouse layout not found.',
  '布局名称不能为空': 'Enter a warehouse name.',
  '画布尺寸须为 10–120 列、8–120 行': 'The canvas must have 10–120 columns and 8–120 rows.',
  '布局包含画布范围外的区域，请先扩大画布': 'A saved object falls outside the canvas; enlarge the canvas first.',
  '布局数据无效': 'Invalid warehouse layout data.',
  '该布局下存在库存，无法删除。请先清空库存。': 'This warehouse still has stock. Move or clear it before deleting the layout.',
  '不能删除当前启用或最后一个仓库；请先选择其他仓库': 'The active or last warehouse cannot be deleted. Activate another warehouse first.',
  '仓库包含货位、任务或历史记录；为保护库存和审计数据，不允许删除': 'This warehouse has locations, tasks, or history and cannot be deleted without losing stock records.',
  '未知的旧任务类型': 'Unknown legacy task type.',
  '请选择有效的仓库后再分配旧任务': 'Select a valid warehouse before assigning this legacy task.',
  '该任务已经分配或不存在': 'This task has already been assigned or no longer exists.',
  '任务包含其他仓库或已删除的货位；请先人工拆分或核对，不能强行归入一个仓库': 'This task contains locations from another warehouse or deleted locations. Reconcile or split it manually; it cannot be assigned as one task.',
  '所选仓库与请求中的仓库不一致': 'The selected warehouse does not match this request.',
  '请先创建并选择仓库': 'Create and select a warehouse first.',
  '所选仓库不存在，请重新选择': 'Warehouse not found. Please select it again.',
  '此仓库中不存在该货位': 'This location does not exist in the selected warehouse.',
  '货位不存在或已停用': 'Location not found or inactive.',
  '货位不存在': 'Location not found.',
  '阈值必须为非负整数': 'The stock threshold must be a non-negative integer.',
  '缺少 shopify_variant_id': 'Shopify variant ID is missing.',
  '条码必须为 8 位数字': 'Enter an eight-digit product barcode.',
  '条码查询失败，请稍后重试': 'Barcode lookup failed. Please try again later.',
  '数量必须大于 0': 'Quantity must be greater than zero.',
  '数量必须为正整数': 'Quantity must be a positive whole number.',
  '数量必须为非负整数': 'Quantity must be a non-negative whole number.',
  '原库存数量无效，请刷新后重试': 'Original stock quantity is invalid. Refresh and retry.',
  '库存数量已经变化，请刷新后再操作': 'Stock changed since you opened this location. Refresh and try again.',
  '请提供当前货架上的正整数库存数量': 'Provide the current positive whole-number quantity on this shelf.',
  '备注不得超过 500 字符': 'The note cannot exceed 500 characters.',
  '请选择 1–500 个不同货位': 'Select between 1 and 500 distinct shelf locations.',
  '部分货位不属于所选仓库或已停用': 'Some selected shelves belong to another warehouse or are inactive.',
  '部分货位缺少二维码，请联系管理员': 'Some shelves lack a QR token. Contact an administrator.',
  '二维码标签生成失败，请重试': 'Could not generate the QR labels. Try again.',
  '标签数量过多，请分批选择货架导出': 'There are too many product labels; export fewer shelves at a time.',
  '缺少来源货位 from_location_id': 'Source location is missing.',
  '来源和目标不能是同一个货位': 'Source and destination cannot be the same location.',
  'stock_type 必须为 retail/retail_display/retail_storage/exhibition': 'Stock type must be retail, retail display, retail storage, or exhibition.',
  '展会备货必须指定 exhibition_id': 'Select an exhibition for exhibition stock.',
  'SKU 不存在，请先同步 Shopify 产品': 'SKU not found. Sync Shopify products first.',
  '数量不能为负数': 'Quantity cannot be negative.',
  '库存记录不存在': 'Inventory record not found.',
  '库存记录或操作历史不可删除；请通过数量调整保留审计记录': 'Stock or inventory history cannot be deleted. Use a quantity adjustment to preserve the audit trail.',
  '备库存不足，无法调拨': 'Insufficient storage stock to transfer.',
  '任务不存在': 'Task not found.',
  '订单行项目不能为空': 'The order must contain at least one item.',
  '缺少 exhibition_id': 'Exhibition ID is missing.',
  '展会不存在': 'Exhibition not found.',
  '展会没有商品，请先添加商品': 'The exhibition has no products. Add products first.',
  '拣货数量必须大于 0': 'Pick quantity must be greater than zero.',
  '拣货数量必须为正整数': 'Pick quantity must be a positive whole number.',
  '库存不足，本次拣货未保存，请检查当前仓库货位库存': 'Insufficient stock: this pick was not saved. Check stock in the selected warehouse.',
  '已完成或取消的任务不能再次拣货': 'A completed, cancelled, or skipped pick cannot be picked again.',
  '拣货行不存在': 'Pick line not found.',
  '该行已完成拣货': 'This line has already been picked.',
  '货位不属于所选仓库，请核对拣货任务': 'The location belongs to another warehouse. Check the picking task.',
  '该行尚未拣货，无需取消': 'This line has not been picked yet.',
  '没有可回滚的数量': 'There is no picked quantity to restore.',
  '旧任务缺少精确拣货记录，无法安全自动回滚；请手动核对货位库存': 'This legacy task lacks a complete pick ledger. Verify the location inventory manually before undoing.',
  '原始库存位置不存在，无法安全自动回滚': 'The original inventory location no longer exists; automatic undo is unsafe.',
  'Shopify 未配置': 'Shopify is not configured.',
  '缺少 shopify_variant_ids': 'Shopify variant IDs are missing.',
  '进行中的任务不能删除，请先取消任务': 'An in-progress task cannot be deleted. Cancel it first.',
  '已发生拣货或完成的任务不可删除，请保留操作历史': 'A task that has been picked or completed cannot be deleted; keep its audit history.',
  '缺少 inbound_shipment_id': 'Inbound shipment ID is missing.',
  '该批入库已分配给另一仓库；不能重复计算收货数量，跨仓请走明确调拨流程': 'This inbound shipment is assigned to another warehouse. Its quantity cannot be counted twice; use an explicit inter-warehouse transfer.',
  '该批次暂无已收货商品': 'This inbound shipment has no received goods yet.',
  '该批次所有 SKU 均未绑定货位，请先在货位详情页绑定 SKU': 'No SKUs in this shipment are linked to a location in this warehouse. Link them on a location detail page first.',
  '该批次没有可用的零售货位绑定，请联系管理员配置 SKU 与货位的绑定': 'This shipment has no usable retail SKU-location bindings in the selected warehouse. Ask an administrator to configure the bindings.',
  '确认数量不能为负数': 'Confirmed quantity cannot be negative.',
  '确认数量必须为非负整数': 'Confirmed quantity must be a non-negative whole number.',
  '确认数量不能超过待补货数量': 'Confirmed quantity cannot exceed the planned replenishment quantity.',
  '该明细已经处理，不能重复确认或跳过': 'This line has already been processed and cannot be confirmed or skipped again.',
  '展会明细缺少展会归属，不能自动入库；请跳过并手动录入指定展会': 'This legacy exhibition line has no exhibition owner. Skip it, then add stock directly to the correct exhibition.',
  '展会备货需要指定展会；请使用货位录入功能，普通入库不能绑定展会库存': 'Exhibition stock requires a specific exhibition. Add it directly to a location instead of a generic inbound binding.',
  '补货明细不存在': 'Replenishment line not found.',
  '该明细已确认': 'This line has already been confirmed.',
  '缺少必要参数': 'Required details are missing.',
  '无效的 stock_type': 'Invalid stock type.',
  'SKU 不存在': 'SKU not found.',
  '绑定不存在': 'SKU binding not found.',
};

function translateMessage(message) {
  if (messages[message]) return messages[message];
  const stockedLocation = /^货位 (.*?) 仍有库存，不能(改变位置|删除或改编号)；请先移动货物$/.exec(message);
  if (stockedLocation) return `Location ${stockedLocation[1]} still contains stock. Move the goods before ${stockedLocation[2] === '改变位置' ? 'moving it' : 'deleting or renumbering it'}.`;
  const transfer = /^已成功调拨 (\d+) 件到上架货位$/.exec(message);
  if (transfer) return `Transferred ${transfer[1]} units to the display location.`;
  if (message.startsWith('Shopify API 错误: ')) return message.replace('Shopify API 错误: ', 'Shopify API error: ');
  if (/[\u3400-\u9fff]/.test(message)) return 'The request could not be completed. Check the details and try again.';
  return message;
}

function localizeResponse(req, res, next) {
  const language = req.get('Accept-Language') || '';
  if (!/^en(?:[-,;]|$)/i.test(language)) return next();
  const sendJson = res.json.bind(res);
  res.json = payload => {
    if (payload && typeof payload.message === 'string') {
      return sendJson({ ...payload, message: translateMessage(payload.message) });
    }
    return sendJson(payload);
  };
  next();
}

module.exports = { localizeResponse, translateMessage };
