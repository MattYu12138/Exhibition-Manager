<template>
  <div class="db-admin-page">
    <!-- 页头 -->
    <div class="page-header">
      <div class="header-left">
        <el-icon size="22" color="#e74c3c"><DataBoard /></el-icon>
        <div>
          <h2>{{ t('dbAdmin.pageTitle') }}</h2>
          <p>{{ t('dbAdmin.pageDesc') }}</p>
        </div>
      </div>
    </div>

    <!-- 分类管理面板 -->
    <el-card class="category-card">
      <template #header>
        <div style="display:flex;align-items:center;justify-content:space-between;">
          <span style="font-weight:700;font-size:15px;"><el-icon style="margin-right:6px;vertical-align:middle;"><Menu /></el-icon>{{ t('dbAdmin.categoryTitle') }}</span>
          <el-button type="primary" size="small" @click="openCatDialog()"><el-icon><Plus /></el-icon> {{ t('dbAdmin.categoryAdd') }}</el-button>
        </div>
      </template>
      <div v-if="catLoading" style="color:#999;font-size:13px;padding:8px 0;">{{ t('dbAdmin.loading') }}</div>
      <el-empty v-else-if="!catLoading && categories.length === 0" :description="t('dbAdmin.categoryEmpty')" style="padding:20px 0" />
      <template v-else>
        <!-- Material 分组 -->
        <div v-if="materialCategories.length > 0" class="cat-group">
          <div class="cat-group-title">
            <el-tag type="warning" size="small" effect="plain">Material</el-tag>
            <span>{{ t('dbAdmin.categoryMaterial') }}</span>
          </div>
          <div class="cat-list">
            <div v-for="cat in materialCategories" :key="cat.id" class="cat-item">
              <span class="cat-name">{{ cat.name }}</span>
              <span class="cat-keyword">{{ cat.keyword }}</span>
              <div class="cat-actions">
                <el-button link type="primary" size="small" @click="openCatDialog(cat)">{{ t('dbAdmin.actionEdit') }}</el-button>
                <el-popconfirm
                  :title="t('dbAdmin.deleteConfirm')"
                  :confirm-button-text="t('dbAdmin.deleteConfirmOk')"
                  :cancel-button-text="t('dbAdmin.deleteConfirmCancel')"
                  confirm-button-type="danger"
                  @confirm="deleteCat(cat.id)"
                >
                  <template #reference>
                    <el-button link type="danger" size="small">{{ t('dbAdmin.actionDelete') }}</el-button>
                  </template>
                </el-popconfirm>
              </div>
            </div>
          </div>
        </div>
        <!-- Style 分组 -->
        <div v-if="styleCategories.length > 0" class="cat-group">
          <div class="cat-group-title">
            <el-tag type="primary" size="small" effect="plain">Style</el-tag>
            <span>{{ t('dbAdmin.categoryStyle') }}</span>
          </div>
          <div class="cat-list">
            <div v-for="cat in styleCategories" :key="cat.id" class="cat-item">
              <span class="cat-name">{{ cat.name }}</span>
              <span class="cat-keyword">{{ cat.keyword }}</span>
              <div class="cat-actions">
                <el-button link type="primary" size="small" @click="openCatDialog(cat)">{{ t('dbAdmin.actionEdit') }}</el-button>
                <el-popconfirm
                  :title="t('dbAdmin.deleteConfirm')"
                  :confirm-button-text="t('dbAdmin.deleteConfirmOk')"
                  :cancel-button-text="t('dbAdmin.deleteConfirmCancel')"
                  confirm-button-type="danger"
                  @confirm="deleteCat(cat.id)"
                >
                  <template #reference>
                    <el-button link type="danger" size="small">{{ t('dbAdmin.actionDelete') }}</el-button>
                  </template>
                </el-popconfirm>
              </div>
            </div>
          </div>
        </div>
      </template>
    </el-card>

    <!-- 分类新增/编辑对话框 -->
    <el-dialog
      v-model="catDialogVisible"
      :title="catEditing ? t('dbAdmin.categoryEdit') : t('dbAdmin.categoryAdd')"
      width="400px"
      :close-on-click-modal="false"
      destroy-on-close
    >
      <el-form :model="catForm" label-position="top" size="small">
        <el-form-item :label="t('dbAdmin.categoryType')" required>
          <el-radio-group v-model="catForm.type">
            <el-radio value="material">Material （材质）</el-radio>
            <el-radio value="style">Style （款式）</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item :label="t('dbAdmin.categoryName')" required>
          <el-input v-model="catForm.name" :placeholder="t('dbAdmin.categoryNamePlaceholder')" clearable />
        </el-form-item>
        <el-form-item :label="t('dbAdmin.categoryKeyword')" required>
          <el-input v-model="catForm.keyword" :placeholder="t('dbAdmin.categoryKeywordPlaceholder')" clearable />
          <div style="font-size:12px;color:#909399;margin-top:4px;">{{ t('dbAdmin.categoryKeywordHint') }}</div>
        </el-form-item>
        <el-form-item :label="t('dbAdmin.categorySortOrder')">
          <el-input-number v-model="catForm.sort_order" :min="0" :max="999" style="width:100%" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="catDialogVisible = false">{{ t('common.cancel') }}</el-button>
        <el-button type="primary" :loading="catSubmitting" @click="submitCat">{{ t('common.save') }}</el-button>
      </template>
    </el-dialog>

    <div class="db-layout">
      <!-- 左侧：表列表 -->
      <div class="table-sidebar">
        <div class="sidebar-title">{{ t('dbAdmin.sidebarTitle') }}</div>
        <div v-if="loadingTables" class="sidebar-loading">
          <el-icon class="is-loading"><Loading /></el-icon> {{ t('dbAdmin.loading') }}
        </div>
        <div
          v-for="tbl in tables"
          :key="tbl.name"
          class="table-item"
          :class="{ active: currentTable === tbl.name }"
          @click="selectTable(tbl)"
        >
          <div class="table-item-name">
            <el-icon><Grid /></el-icon>
            {{ tbl.name }}
          </div>
          <el-tag size="small" type="info">{{ tbl.row_count }}</el-tag>
        </div>
      </div>

      <!-- 右侧：数据区域 -->
      <div class="table-content">
        <!-- 未选择表时的提示 -->
        <div v-if="!currentTable" class="empty-hint">
          <el-icon size="48" color="#ddd"><Grid /></el-icon>
          <p>{{ t('dbAdmin.selectHint') }}</p>
        </div>

        <template v-else>
          <!-- 工具栏 -->
          <div class="toolbar">
            <div class="toolbar-left">
              <span class="table-name-badge">{{ currentTable }}</span>
              <el-tag type="info" size="small">{{ t('dbAdmin.total', { n: total }) }}</el-tag>
            </div>
            <div class="toolbar-right">
              <el-input
                v-model="searchText"
                :placeholder="t('dbAdmin.searchPlaceholder')"
                clearable
                size="small"
                style="width: 200px"
                @input="handleSearch"
              >
                <template #prefix><el-icon><Search /></el-icon></template>
              </el-input>
              <el-button size="small" @click="loadRows" :loading="loadingRows">
                <el-icon><Refresh /></el-icon> {{ t('dbAdmin.refresh') }}
              </el-button>
              <el-button type="primary" size="small" @click="openAddDialog">
                <el-icon><Plus /></el-icon> {{ t('dbAdmin.addRow') }}
              </el-button>
            </div>
          </div>

          <!-- SQL 查询栏 -->
          <div class="sql-bar">
            <el-input
              v-model="sqlQuery"
              :placeholder="t('dbAdmin.sqlPlaceholder')"
              size="small"
              clearable
              @keyup.enter="runSqlQuery"
            >
              <template #prepend>{{ t('dbAdmin.sqlLabel') }}</template>
              <template #append>
                <el-button size="small" @click="runSqlQuery" :loading="sqlRunning">
                  {{ t('dbAdmin.sqlRun') }}
                </el-button>
              </template>
            </el-input>
          </div>

          <!-- 数据表格 -->
          <div class="table-wrapper">
            <el-table
              v-loading="loadingRows"
              :data="sqlResult || rows"
              border
              stripe
              size="small"
              height="100%"
            >
              <!-- 操作列（非 SQL 模式） -->
              <el-table-column v-if="!sqlResult" :label="t('common.edit') + '/' + t('common.delete')" width="120" fixed="left">
                <template #default="{ row }">
                  <el-button
                    link
                    type="primary"
                    size="small"
                    @click="openEditDialog(row)"
                  >{{ t('dbAdmin.actionEdit') }}</el-button>
                  <el-popconfirm
                    :title="t('dbAdmin.deleteConfirm')"
                    :confirm-button-text="t('dbAdmin.deleteConfirmOk')"
                    :cancel-button-text="t('dbAdmin.deleteConfirmCancel')"
                    confirm-button-type="danger"
                    @confirm="deleteRow(row)"
                  >
                    <template #reference>
                      <el-button link type="danger" size="small">{{ t('dbAdmin.actionDelete') }}</el-button>
                    </template>
                  </el-popconfirm>
                </template>
              </el-table-column>

              <!-- 动态列 -->
              <el-table-column
                v-for="col in displayColumns"
                :key="col.name"
                :prop="col.name"
                :label="col.name"
                :min-width="getColWidth(col)"
                show-overflow-tooltip
              >
                <template #default="{ row }">
                  <span :class="{ 'pk-cell': col.pk, 'null-cell': row[col.name] === null }">
                    {{ row[col.name] === null ? 'NULL' : row[col.name] }}
                  </span>
                </template>
              </el-table-column>
            </el-table>
          </div>

          <!-- 分页（非 SQL 模式） -->
          <div v-if="!sqlResult" class="pagination">
            <el-pagination
              v-model:current-page="currentPage"
              v-model:page-size="pageSize"
              :page-sizes="[20, 50, 100, 200]"
              :total="total"
              layout="total, sizes, prev, pager, next"
              small
              @change="loadRows"
            />
          </div>
          <div v-else class="sql-result-bar">
            <el-tag type="success">{{ t('dbAdmin.sqlResult', { n: sqlResult.length }) }}</el-tag>
            <el-button link size="small" @click="sqlResult = null; sqlQuery = ''">
              {{ t('dbAdmin.clearResult') }}
            </el-button>
          </div>
        </template>
      </div>
    </div>

    <!-- 新增/编辑对话框 -->
    <el-dialog
      v-model="dialogVisible"
      :title="isEditing ? t('dbAdmin.editRow') : t('dbAdmin.addRowTitle')"
      width="600px"
      :close-on-click-modal="false"
      destroy-on-close
    >
      <el-form :model="formData" label-position="top" size="small">
        <el-form-item
          v-for="col in editableColumns"
          :key="col.name"
          :label="col.name + (col.pk ? ' ' + t('dbAdmin.pkLabel') : '') + (col.type ? ` [${col.type}]` : '')"
        >
          <el-input
            v-model="formData[col.name]"
            :placeholder="col.dflt_value !== null ? t('dbAdmin.defaultLabel', { v: col.dflt_value }) : ''"
            :disabled="isEditing && col.pk === 1"
            clearable
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">{{ t('common.cancel') }}</el-button>
        <el-button type="primary" :loading="submitting" @click="submitForm">
          {{ isEditing ? t('common.save') : t('dbAdmin.addRow') }}
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { ElMessage } from 'element-plus'
import axios from 'axios'
import { DataBoard, Grid, Search, Refresh, Plus, Loading, Menu } from '@element-plus/icons-vue'
import { categoriesApi } from '@/api'

const { t } = useI18n()

// ─── 状态 ────────────────────────────────────────────────────────
const tables = ref([])
const loadingTables = ref(false)
const currentTable = ref('')
const currentTableInfo = ref(null)

const rows = ref([])
const total = ref(0)
const loadingRows = ref(false)
const currentPage = ref(1)
const pageSize = ref(50)
const searchText = ref('')
let searchTimer = null

const sqlQuery = ref('')
const sqlRunning = ref(false)
const sqlResult = ref(null)

const dialogVisible = ref(false)
const isEditing = ref(false)
const formData = ref({})
const editingId = ref(null)
const submitting = ref(false)

// ─── 计算属性 ────────────────────────────────────────────────────
const displayColumns = computed(() => {
  if (sqlResult.value && sqlResult.value.length > 0) {
    return Object.keys(sqlResult.value[0]).map(k => ({ name: k, type: '', pk: 0 }))
  }
  return currentTableInfo.value?.columns || []
})

const editableColumns = computed(() => currentTableInfo.value?.columns || [])

// ─── 方法 ────────────────────────────────────────────────────────
async function loadTables() {
  loadingTables.value = true
  try {
    const res = await axios.get('/api/dbadmin/tables')
    tables.value = res.data.data
  } catch (e) {
    ElMessage.error(t('dbAdmin.loadFailed') + ': ' + (e.response?.data?.message || e.message))
  } finally {
    loadingTables.value = false
  }
}

async function selectTable(tableInfo) {
  currentTable.value = tableInfo.name
  currentTableInfo.value = tableInfo
  currentPage.value = 1
  searchText.value = ''
  sqlResult.value = null
  sqlQuery.value = ''
  await loadRows()
}

async function loadRows() {
  if (!currentTable.value) return
  loadingRows.value = true
  try {
    const res = await axios.get(`/api/dbadmin/tables/${currentTable.value}/rows`, {
      params: { page: currentPage.value, pageSize: pageSize.value, search: searchText.value },
    })
    rows.value = res.data.data
    total.value = res.data.total
    if (currentTableInfo.value) {
      currentTableInfo.value.columns = res.data.columns
    }
  } catch (e) {
    ElMessage.error(t('dbAdmin.dataFailed') + ': ' + (e.response?.data?.message || e.message))
  } finally {
    loadingRows.value = false
  }
}

function handleSearch() {
  clearTimeout(searchTimer)
  searchTimer = setTimeout(() => {
    currentPage.value = 1
    loadRows()
  }, 400)
}

async function runSqlQuery() {
  if (!sqlQuery.value.trim()) return
  sqlRunning.value = true
  try {
    const res = await axios.post('/api/dbadmin/query', { sql: sqlQuery.value })
    sqlResult.value = res.data.data
    ElMessage.success(t('dbAdmin.sqlSuccess', { n: res.data.count }))
  } catch (e) {
    ElMessage.error(t('dbAdmin.sqlFailed') + ': ' + (e.response?.data?.message || e.message))
  } finally {
    sqlRunning.value = false
  }
}

function openAddDialog() {
  isEditing.value = false
  formData.value = {}
  dialogVisible.value = true
}

function openEditDialog(row) {
  isEditing.value = true
  formData.value = { ...row }
  const pkCol = currentTableInfo.value?.columns?.find(c => c.pk === 1)
  editingId.value = pkCol ? row[pkCol.name] : row.id
  dialogVisible.value = true
}

async function submitForm() {
  submitting.value = true
  try {
    if (isEditing.value) {
      const pkCol = currentTableInfo.value?.columns?.find(c => c.pk === 1)
      const updateData = { ...formData.value }
      if (pkCol) delete updateData[pkCol.name]
      await axios.put(`/api/dbadmin/tables/${currentTable.value}/rows/${editingId.value}`, updateData)
      ElMessage.success(t('dbAdmin.updateSuccess'))
    } else {
      await axios.post(`/api/dbadmin/tables/${currentTable.value}/rows`, formData.value)
      ElMessage.success(t('dbAdmin.addSuccess'))
    }
    dialogVisible.value = false
    await loadRows()
    await loadTables()
  } catch (e) {
    const msg = isEditing.value ? t('dbAdmin.updateFailed') : t('dbAdmin.addFailed')
    ElMessage.error(msg + ': ' + (e.response?.data?.message || e.message))
  } finally {
    submitting.value = false
  }
}

async function deleteRow(row) {
  const pkCol = currentTableInfo.value?.columns?.find(c => c.pk === 1)
  const id = pkCol ? row[pkCol.name] : row.id
  try {
    await axios.delete(`/api/dbadmin/tables/${currentTable.value}/rows/${id}`)
    ElMessage.success(t('dbAdmin.deleteSuccess'))
    await loadRows()
    await loadTables()
  } catch (e) {
    ElMessage.error(t('dbAdmin.deleteFailed') + ': ' + (e.response?.data?.message || e.message))
  }
}

function getColWidth(col) {
  const longCols = ['password_hash', 'password_encrypted', 'image_url', 'square_catalog_variation_id']
  if (longCols.includes(col.name)) return 180
  if (col.name === 'id') return 160
  if (['created_at', 'updated_at', 'synced_at'].includes(col.name)) return 160
  return 120
}

// ─── 分类管理 ────────────────────────────────────────────────────────────────────────────────
const categories = ref([])
const catLoading = ref(false)
const catDialogVisible = ref(false)
const catEditing = ref(null) // null=新增, object=编辑
const catForm = ref({ name: '', keyword: '', type: 'style', sort_order: 0 })
const catSubmitting = ref(false)

const materialCategories = computed(() => categories.value.filter(c => c.type === 'material'))
const styleCategories = computed(() => categories.value.filter(c => c.type === 'style'))

async function loadCategories() {
  catLoading.value = true
  try {
    const res = await categoriesApi.getAll()
    categories.value = res.data || []
  } catch (e) {
    ElMessage.error('分类加载失败: ' + (e.message || ''))
  } finally {
    catLoading.value = false
  }
}

function openCatDialog(cat = null) {
  catEditing.value = cat
  catForm.value = cat
    ? { name: cat.name, keyword: cat.keyword, type: cat.type || 'style', sort_order: cat.sort_order || 0 }
    : { name: '', keyword: '', type: 'style', sort_order: 0 }
  catDialogVisible.value = true
}

async function submitCat() {
  if (!catForm.value.name || !catForm.value.keyword) {
    ElMessage.warning('名称和关键词不能为空')
    return
  }
  catSubmitting.value = true
  try {
    if (catEditing.value) {
      await categoriesApi.update(catEditing.value.id, catForm.value)
      ElMessage.success('已更新')
    } else {
      await categoriesApi.create(catForm.value)
      ElMessage.success('已添加')
    }
    catDialogVisible.value = false
    await loadCategories()
  } catch (e) {
    ElMessage.error('操作失败: ' + (e.response?.data?.message || e.message))
  } finally {
    catSubmitting.value = false
  }
}

async function deleteCat(id) {
  try {
    await categoriesApi.delete(id)
    ElMessage.success('已删除')
    await loadCategories()
  } catch (e) {
    ElMessage.error('删除失败: ' + (e.response?.data?.message || e.message))
  }
}

onMounted(async () => {
  await Promise.all([loadTables(), loadCategories()])
})
</script>

<style scoped>
.db-admin-page {
  min-height: calc(100vh - 60px);
  background: #f5f7fa;
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.page-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: #fff;
  border-radius: 8px;
  padding: 16px 20px;
  box-shadow: 0 1px 4px rgba(0,0,0,0.06);
}

.header-left {
  display: flex;
  align-items: center;
  gap: 12px;
}

.header-left h2 {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  color: #1a1a2e;
}

.header-left p {
  margin: 2px 0 0;
  font-size: 13px;
  color: #888;
}

.db-layout {
  display: flex;
  gap: 16px;
  flex: 1;
  min-height: 0;
  height: calc(100vh - 180px);
}

.table-sidebar {
  width: 200px;
  flex-shrink: 0;
  background: #fff;
  border-radius: 8px;
  box-shadow: 0 1px 4px rgba(0,0,0,0.06);
  overflow-y: auto;
  padding: 8px 0;
}

.sidebar-title {
  font-size: 11px;
  font-weight: 600;
  color: #aaa;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  padding: 8px 16px 4px;
}

.sidebar-loading {
  padding: 12px 16px;
  color: #999;
  font-size: 13px;
  display: flex;
  align-items: center;
  gap: 6px;
}

.table-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 16px;
  cursor: pointer;
  transition: background 0.15s;
  border-left: 3px solid transparent;
}

.table-item:hover { background: #f0f4ff; }
.table-item.active { background: #ecf0ff; border-left-color: #409eff; }

.table-item-name {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: #333;
  font-weight: 500;
}

.table-content {
  flex: 1;
  background: #fff;
  border-radius: 8px;
  box-shadow: 0 1px 4px rgba(0,0,0,0.06);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  min-height: 0;
}

.empty-hint {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: #ccc;
  gap: 12px;
  font-size: 14px;
}

.toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  border-bottom: 1px solid #f0f0f0;
  flex-shrink: 0;
}

.toolbar-left { display: flex; align-items: center; gap: 10px; }
.toolbar-right { display: flex; align-items: center; gap: 8px; }

.table-name-badge {
  font-size: 14px;
  font-weight: 600;
  color: #1a1a2e;
  background: #f0f4ff;
  padding: 2px 10px;
  border-radius: 4px;
  border: 1px solid #d0d8ff;
}

.sql-bar {
  padding: 8px 16px;
  border-bottom: 1px solid #f0f0f0;
  flex-shrink: 0;
}

.table-wrapper {
  flex: 1;
  overflow: hidden;
  min-height: 0;
}

.pagination {
  padding: 10px 16px;
  border-top: 1px solid #f0f0f0;
  flex-shrink: 0;
  display: flex;
  justify-content: flex-end;
}

.sql-result-bar {
  padding: 8px 16px;
  border-top: 1px solid #f0f0f0;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 12px;
}

.pk-cell {
  color: #409eff;
  font-weight: 600;
  font-family: monospace;
  font-size: 12px;
}

.null-cell {
  color: #bbb;
  font-style: italic;
  font-size: 12px;
}

:deep(.el-table .el-table__cell) { font-size: 12px; }

/* 分类管理 */
.category-card { margin-bottom: 16px; }
.cat-group {
  margin-bottom: 16px;
}
.cat-group:last-child { margin-bottom: 0; }
.cat-group-title {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 10px;
  font-size: 13px;
  font-weight: 600;
  color: #606266;
}
.cat-list {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  min-height: 40px;
}
.cat-item {
  display: flex;
  align-items: center;
  gap: 8px;
  background: #f5f7fa;
  border: 1px solid #ebeef5;
  border-radius: 8px;
  padding: 6px 12px;
}
.cat-name {
  font-weight: 600;
  font-size: 13px;
  color: #303133;
}
.cat-keyword {
  font-size: 12px;
  color: #909399;
  background: #ecf5ff;
  border-radius: 4px;
  padding: 1px 6px;
  border: 1px solid #b3d8ff;
  color: #409eff;
}
.cat-actions {
  display: flex;
  gap: 4px;
  margin-left: 4px;
}
@media (max-width: 768px) {
  .cat-item { flex-wrap: wrap; }
}
</style>
