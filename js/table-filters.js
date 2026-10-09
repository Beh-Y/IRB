/* Adds a per-column filter row to a table -- a text search box for
 * free-text columns, a dropdown (populated from the table's own current
 * values) for categorical ones -- and wires it to hide non-matching rows
 * live as the user types/selects. Meant to be called once, right after a
 * table's rows are rendered.
 *
 * columnConfigs: one entry per <th>, in the same order -- 'text',
 * 'select', or null for a column with no filter (e.g. an Action column of
 * buttons/links, which still gets an empty cell in the filter row to keep
 * the columns aligned).
 *
 * A "no data yet" empty-state row (a single <td colspan>, no per-column
 * cells to read) is detected and skipped automatically, rather than
 * requiring every caller to mark it -- same trick used for the "no rows
 * match the current filters" row this adds, so the two never conflict.
 *
 * Returns { isRowVisible(index) }, so a caller that also exports this
 * table's underlying row data (see report.js) can keep the export in sync
 * with whatever's currently filtered into view. Dropdown options are
 * fixed at setup time (every value seen across the whole table), not
 * recomputed as other filters narrow the result -- simpler and more
 * predictable than cascading options that shrink as you filter. */
function attachColumnFilters(table, columnConfigs) {
  const headerRow = table.querySelector('thead tr');
  const tbody = table.querySelector('tbody');
  if (!headerRow || !tbody) return { isRowVisible: () => true };

  const filterRow = document.createElement('tr');
  filterRow.className = 'column-filter-row';

  const filters = [];
  columnConfigs.forEach((type, colIndex) => {
    const td = document.createElement('td');
    if (type) {
      const control = document.createElement(type === 'select' ? 'select' : 'input');
      control.className = 'column-filter-input';
      if (type === 'text') {
        control.type = 'text';
        control.placeholder = 'Filter…';
      } else {
        const allOption = document.createElement('option');
        allOption.value = '';
        allOption.textContent = 'All';
        control.appendChild(allOption);
      }
      td.appendChild(control);
      filters.push({ colIndex, type, control });
    }
    filterRow.appendChild(td);
  });

  headerRow.after(filterRow);

  // A synthetic empty-state row (this one's own "no matches", or the
  // page's own "nothing here yet") is a single <td colspan>, never one
  // <td> per column -- that's the marker used to tell it apart from a
  // real data row.
  function dataRows() {
    return Array.from(tbody.rows).filter((row) => !row.querySelector('td[colspan]'));
  }

  function cellText(row, colIndex) {
    const cell = row.children[colIndex];
    return cell ? cell.textContent.trim() : '';
  }

  function populateSelectOptions() {
    const rows = dataRows();
    filters.forEach((f) => {
      if (f.type !== 'select') return;
      const current = f.control.value;
      const values = [...new Set(rows.map((row) => cellText(row, f.colIndex)).filter(Boolean))].sort((a, b) =>
        a.localeCompare(b)
      );
      f.control.innerHTML = '';
      const allOption = document.createElement('option');
      allOption.value = '';
      allOption.textContent = 'All';
      f.control.appendChild(allOption);
      values.forEach((v) => {
        const opt = document.createElement('option');
        opt.value = v;
        opt.textContent = v;
        f.control.appendChild(opt);
      });
      f.control.value = values.includes(current) ? current : '';
    });
  }

  let noMatchesRow = null;
  function applyFilters() {
    const rows = dataRows();
    let visibleCount = 0;
    rows.forEach((row) => {
      const matches = filters.every((f) => {
        const value = f.control.value.trim().toLowerCase();
        if (!value) return true;
        const text = cellText(row, f.colIndex).toLowerCase();
        return f.type === 'select' ? text === value : text.includes(value);
      });
      row.hidden = !matches;
      if (matches) visibleCount += 1;
    });

    if (rows.length > 0 && visibleCount === 0) {
      if (!noMatchesRow) {
        noMatchesRow = document.createElement('tr');
        const td = document.createElement('td');
        td.colSpan = columnConfigs.length;
        td.className = 'empty-state';
        td.textContent = 'No rows match the current filters.';
        noMatchesRow.appendChild(td);
        tbody.appendChild(noMatchesRow);
      }
      noMatchesRow.hidden = false;
    } else if (noMatchesRow) {
      noMatchesRow.hidden = true;
    }
  }

  filters.forEach((f) => f.control.addEventListener(f.type === 'select' ? 'change' : 'input', applyFilters));
  populateSelectOptions();
  applyFilters();

  return {
    isRowVisible: (index) => {
      const row = dataRows()[index];
      return !!row && !row.hidden;
    },
  };
}
