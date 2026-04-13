<template>
  <div class="db-admin-page">
    <div class="page-header">
      <div class="header-left">
        <el-icon size="22" color="#e74c3c"><DataBoard /></el-icon>
        <div>
          <h2>{{ t('dbAdmin.pageTitle') }}</h2>
          <p>{{ t('dbAdmin.pageDesc') }}</p>
        </div>
      </div>
    </div>
    <div class="db-layout">
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
      <div class="table-content">
        <div v-if="!currentTable" class="empty-hint">
          <el-icon size="48" color="#ddd"><Grid /></el-icon>
          <p>{{ t('dbAdmin.selectHint') }}</p>
        </div>
        <template v-else>
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
          <div class="table-wrapper">
            <el-table
              v-loading="loadingRows"
              :data="sqlResult || rows"
              border
              stripe
              size="small"
              height="100%"
            >
              <el-table-column v-if="!sqlResult" label="" width="120" fixed="left">
                <template #default="{ row }">
                  <el-button link type="primary" size="small" @click="openEditDialog(row)">{{ t('dbAdmin.actionEdit') }}</el-button>
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
import { DataBoard, Grid, Search, Refresh, Plus, Loading } from '@element-plus/icons-vue'

const { t } = useI18n()
const api = axios.create({ baseURL: '/api', withCredentials: true })

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

const displayColumns = computed(() => {
  if (sqlResult.value && sqlResult.value.length > 0) {
    return Object.keys(sqlResult.value[0]).map(k => ({ name: k, type: '', pk: 0 }))
  }
  return currentTableInfo.value?.columns || []
})
const editableColumns = computed(() => currentTableInfo.value?.columns || [])

async function loadTables() {
  loadingTables.value = true
  try {
    const res = await api.get('/dbadmin/tables')
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
    const res = await api.get(`/dbadmin/tables/${currentTable.value}/rows`, {
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
    const res = await api.post('/dbadmin/query', { sql: sqlQuery.value })
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
      await api.put(`/dbadmin/tables/${currentTable.value}/rows/${editingId.value}`, updateData)
      ElMessage.success(t('dbAdmin.updateSuccess'))
    } else {
      await api.post(`/dbadmin/tables/${currentTable.value}/rows`, formData.value)
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
    await api.delete(`/dbadmin/tables/${currentTable.value}/rows/${id}`)
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
.header-left { display: flex; align-items: center; gap: 12px; }
.header-left h2 { margin: 0; font-size: 18px; font-weight: 600; color: #1a1a2e; }
.header-left p { margin: 2px 0 0; font-size: 13px; color: #888; }
.db-layout { display: flex; gap: 16px; flex: 1; min-height: 0; height: calc(100vh - 180px); }
.table-sidebar {
  width: 200px; flex-shrink: 0; background: #fff; border-radius: 8px;
  box-shadow: 0 1px 4px rgba(0,0,0,0.06); overflow-y: auto; padding: 8px 0;
}
.sidebar-title { font-size: 11px; font-weight: 600; color: #aaa; text-transform: uppercase; letter-spacing: 0.5px; padding: 8px 16px 4px; }
.sidebar-loading { padding: 12px 16px; color: #999; font-size: 13px; display: flex; align-items: center; gap: 6px; }
.table-item { display: flex; align-items: center; justify-content: space-between; padding: 8px 16px; cursor: pointer; transition: background 0.15s; border-left: 3px solid transparent; }
.table-item:hover { background: #f0f4ff; }
.table-item.active { background: #ecf0ff; border-left-color: #409eff; }
.table-item-name { display: flex; align-items: center; gap: 6px; font-size: 13px; color: #333; font-weight: 500; }
.table-content { flex: 1; background: #fff; border-radius: 8px; box-shadow: 0 1px 4px rgba(0,0,0,0.06); display: flex; flex-direction: column; overflow: hidden; min-height: 0; }
.empty-hint { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; color: #ccc; gap: 12px; font-size: 14px; }
.toolbar { display: flex; align-items: center; justify-content: space-between; padding: 12px 16px; border-bottom: 1px solid #f0f0f0; flex-shrink: 0; }
.toolbar-left { display: flex; align-items: center; gap: 10px; }
.toolbar-right { display: flex; align-items: center; gap: 8px; }
.table-name-badge { font-size: 14px; font-weight: 600; color: #1a1a2e; background: #f0f4ff; padding: 2px 10px; border-radius: 4px; border: 1px solid #d0d8ff; }
.sql-bar { padding: 8px 16px; border-bottom: 1px solid #f0f0f0; flex-shrink: 0; }
.table-wrapper { flex: 1; overflow: hidden; min-height: 0; }
.pagination { padding: 10px 16px; border-top: 1px solid #f0f0f0; flex-shrink: 0; display: flex; justify-content: flex-end; }
.sql-result-bar { padding: 8px 16px; border-top: 1px solid #f0f0f0; flex-shrink: 0; display: flex; align-items: center; gap: 12px; }
.pk-cell { color: #409eff; font-weight: 600; font-family: monospace; font-size: 12px; }
.null-cell { color: #bbb; font-style: italic; font-size: 12px; }
:deep(.el-table .el-table__cell) { font-size: 12px; }
</style>
