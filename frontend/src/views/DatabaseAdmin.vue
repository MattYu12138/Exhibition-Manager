<template>
  <div class="db-admin-page">
    <!-- 页头 -->
    <div class="page-header">
      <div class="header-left">
        <el-icon size="22" color="#e74c3c"><DataBoard /></el-icon>
        <div>
          <h2>数据库管理</h2>
          <p>直接查看和编辑数据库中的所有数据表</p>
        </div>
      </div>
    </div>

    <div class="db-layout">
      <!-- 左侧：表列表 -->
      <div class="table-sidebar">
        <div class="sidebar-title">数据表</div>
        <div v-if="loadingTables" class="sidebar-loading">
          <el-icon class="is-loading"><Loading /></el-icon> 加载中...
        </div>
        <div
          v-for="t in tables"
          :key="t.name"
          class="table-item"
          :class="{ active: currentTable === t.name }"
          @click="selectTable(t)"
        >
          <div class="table-item-name">
            <el-icon><Grid /></el-icon>
            {{ t.name }}
          </div>
          <el-tag size="small" type="info">{{ t.row_count }}</el-tag>
        </div>
      </div>

      <!-- 右侧：数据区域 -->
      <div class="table-content">
        <!-- 未选择表时的提示 -->
        <div v-if="!currentTable" class="empty-hint">
          <el-icon size="48" color="#ddd"><Grid /></el-icon>
          <p>请从左侧选择一个数据表</p>
        </div>

        <template v-else>
          <!-- 工具栏 -->
          <div class="toolbar">
            <div class="toolbar-left">
              <span class="table-name-badge">{{ currentTable }}</span>
              <el-tag type="info" size="small">共 {{ total }} 条</el-tag>
            </div>
            <div class="toolbar-right">
              <el-input
                v-model="searchText"
                placeholder="搜索..."
                clearable
                size="small"
                style="width: 200px"
                @input="handleSearch"
              >
                <template #prefix><el-icon><Search /></el-icon></template>
              </el-input>
              <el-button size="small" @click="loadRows" :loading="loadingRows">
                <el-icon><Refresh /></el-icon> 刷新
              </el-button>
              <el-button type="primary" size="small" @click="openAddDialog">
                <el-icon><Plus /></el-icon> 新增
              </el-button>
            </div>
          </div>

          <!-- SQL 查询栏 -->
          <div class="sql-bar">
            <el-input
              v-model="sqlQuery"
              placeholder="自定义 SELECT 查询（仅限 SELECT）..."
              size="small"
              clearable
              @keyup.enter="runSqlQuery"
            >
              <template #prepend>SQL</template>
              <template #append>
                <el-button size="small" @click="runSqlQuery" :loading="sqlRunning">执行</el-button>
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
              :row-class-name="rowClassName"
            >
              <!-- 操作列（非 SQL 模式） -->
              <el-table-column v-if="!sqlResult" label="操作" width="120" fixed="left">
                <template #default="{ row }">
                  <el-button
                    link
                    type="primary"
                    size="small"
                    @click="openEditDialog(row)"
                  >编辑</el-button>
                  <el-popconfirm
                    title="确定要删除这条记录吗？"
                    confirm-button-text="删除"
                    cancel-button-text="取消"
                    confirm-button-type="danger"
                    @confirm="deleteRow(row)"
                  >
                    <template #reference>
                      <el-button link type="danger" size="small">删除</el-button>
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
            <el-tag type="success">SQL 查询结果：{{ sqlResult.length }} 条</el-tag>
            <el-button link size="small" @click="sqlResult = null; sqlQuery = ''">清除结果</el-button>
          </div>
        </template>
      </div>
    </div>

    <!-- 新增/编辑对话框 -->
    <el-dialog
      v-model="dialogVisible"
      :title="isEditing ? '编辑记录' : '新增记录'"
      width="600px"
      :close-on-click-modal="false"
      destroy-on-close
    >
      <el-form :model="formData" label-position="top" size="small">
        <el-form-item
          v-for="col in editableColumns"
          :key="col.name"
          :label="col.name + (col.pk ? ' (主键)' : '') + (col.type ? ` [${col.type}]` : '')"
        >
          <el-input
            v-model="formData[col.name]"
            :placeholder="col.dflt_value !== null ? `默认: ${col.dflt_value}` : ''"
            :disabled="isEditing && col.pk === 1"
            clearable
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="submitting" @click="submitForm">
          {{ isEditing ? '保存' : '新增' }}
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import axios from 'axios'
import { DataBoard, Grid, Search, Refresh, Plus, Loading } from '@element-plus/icons-vue'

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
    ElMessage.error('加载表列表失败: ' + (e.response?.data?.message || e.message))
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
    // 更新列信息
    if (currentTableInfo.value) {
      currentTableInfo.value.columns = res.data.columns
    }
  } catch (e) {
    ElMessage.error('加载数据失败: ' + (e.response?.data?.message || e.message))
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
    ElMessage.success(`查询完成，返回 ${res.data.count} 条`)
  } catch (e) {
    ElMessage.error('查询失败: ' + (e.response?.data?.message || e.message))
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
  // 找主键
  const pkCol = currentTableInfo.value?.columns?.find(c => c.pk === 1)
  editingId.value = pkCol ? row[pkCol.name] : row.id
  dialogVisible.value = true
}

async function submitForm() {
  submitting.value = true
  try {
    if (isEditing.value) {
      // 过滤掉主键列（不允许修改）
      const pkCol = currentTableInfo.value?.columns?.find(c => c.pk === 1)
      const updateData = { ...formData.value }
      if (pkCol) delete updateData[pkCol.name]
      await axios.put(`/api/dbadmin/tables/${currentTable.value}/rows/${editingId.value}`, updateData)
      ElMessage.success('更新成功')
    } else {
      await axios.post(`/api/dbadmin/tables/${currentTable.value}/rows`, formData.value)
      ElMessage.success('新增成功')
    }
    dialogVisible.value = false
    await loadRows()
    await loadTables() // 刷新行数
  } catch (e) {
    ElMessage.error((isEditing.value ? '更新' : '新增') + '失败: ' + (e.response?.data?.message || e.message))
  } finally {
    submitting.value = false
  }
}

async function deleteRow(row) {
  const pkCol = currentTableInfo.value?.columns?.find(c => c.pk === 1)
  const id = pkCol ? row[pkCol.name] : row.id
  try {
    await axios.delete(`/api/dbadmin/tables/${currentTable.value}/rows/${id}`)
    ElMessage.success('删除成功')
    await loadRows()
    await loadTables()
  } catch (e) {
    ElMessage.error('删除失败: ' + (e.response?.data?.message || e.message))
  }
}

function getColWidth(col) {
  const longCols = ['password_hash', 'password_encrypted', 'image_url', 'square_catalog_variation_id']
  if (longCols.includes(col.name)) return 180
  if (col.name === 'id') return 160
  if (['created_at', 'updated_at', 'synced_at'].includes(col.name)) return 160
  return 120
}

function rowClassName({ rowIndex }) {
  return rowIndex % 2 === 0 ? '' : 'stripe-row'
}

onMounted(loadTables)
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

/* 左侧侧边栏 */
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

.table-item:hover {
  background: #f0f4ff;
}

.table-item.active {
  background: #ecf0ff;
  border-left-color: #409eff;
}

.table-item-name {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: #333;
  font-weight: 500;
}

/* 右侧内容区 */
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

.toolbar-left {
  display: flex;
  align-items: center;
  gap: 10px;
}

.toolbar-right {
  display: flex;
  align-items: center;
  gap: 8px;
}

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

:deep(.el-table .stripe-row) {
  background: #fafafa;
}

:deep(.el-table .el-table__cell) {
  font-size: 12px;
}
</style>
