/**
 * A fluent interface for building SQL SELECT queries with dynamic filtering, sorting, and pagination.
 */
class QueryBuilder {
    /**
     * @param {string} baseQuery - The initial SELECT and FROM statement, without WHERE, ORDER BY, or LIMIT.
     */
    constructor(baseQuery) {
        this.query = baseQuery;
        this.params = [];
        this.whereClauses = [];
    }

    /**
     * Adds WHERE clauses based on request query parameters.
     * @param {object} queryParams - The req.query object from Express.
     * @param {object} allowedFilters - A mapping of query param keys to database column names.
     *                                  Example: { class_id: 'c.id', date: 'a.date' }
     */
    applyFilters(queryParams, allowedFilters) {
        for (const dbColumn in allowedFilters) {
            const queryParamName = allowedFilters[dbColumn];
            if (queryParams[queryParamName] !== undefined && queryParams[queryParamName] !== '') {
                this.whereClauses.push(`${dbColumn} = ?`);
                this.params.push(queryParams[queryParamName]);
            }
        }
        return this; // Return `this` to allow chaining
    }

    /**
     * Adds a WHERE clause for a full-text search across multiple fields.
     * @param {object} queryParams - The req.query object from Express.
     * @param {string[]} searchFields - An array of database columns to search against.
     */
    applySearch(queryParams, searchFields) {
        const { search } = queryParams;
        if (search && searchFields && searchFields.length > 0) {
            const searchClauses = searchFields.map(field => `${field} LIKE ?`);
            this.whereClauses.push(`(${searchClauses.join(' OR ')})`);
            // Add a parameter for each search field
            searchFields.forEach(() => {
                this.params.push(`%${search}%`);
            });
        }
        return this;
    }

    /**
     * Adds ORDER BY clause.
     * @param {object} queryParams - The req.query object.
     * @param {string} defaultSort - The default column to sort by (e.g., 'name ASC').
     */
    applySorting(queryParams, defaultSort) {
        const { sort_by, order } = queryParams;
        if (sort_by) {
            const sortOrder = (order && order.toUpperCase() === 'DESC') ? 'DESC' : 'ASC';
            // Basic sanitization to prevent SQL injection in column names
            const safeSortBy = sort_by.replace(/[^a-zA-Z0-9_.]/g, '');
            this.query += ` ORDER BY ${safeSortBy} ${sortOrder}`;
        } else if (defaultSort) {
            this.query += ` ORDER BY ${defaultSort}`;
        }
        return this;
    }

    /**
     * Adds LIMIT and OFFSET for pagination.
     * @param {object} queryParams - The req.query object.
     * @param {number} [defaultLimit=25] - The default number of items per page.
     */
    applyPagination(queryParams, defaultLimit = 25) {
        const limit = parseInt(queryParams.limit, 10) || defaultLimit;
        const page = parseInt(queryParams.page, 10) || 1;
        const offset = (page - 1) * limit;

        this.query += ' LIMIT ? OFFSET ?';
        this.params.push(limit, offset);
        return this;
    }

    /**
     * Finalizes the query string by adding WHERE clauses.
     * @returns {{query: string, params: Array<any>}} The final query string and parameters array.
     */
    build() {
        if (this.whereClauses.length > 0) {
            this.query += ' WHERE ' + this.whereClauses.join(' AND ');
        }
        return {
            query: this.query,
            params: this.params,
        };
    }

    /**
     * A static helper to quickly build a full query.
     * @param {string} baseQuery
     * @param {object} queryParams
     * @param {object} filterConfig
     * @param {string[]} searchConfig - Array of fields to search.
     * @param {string} sortConfig
     * @returns {{query: string, params: Array<any>}}
     */
    static buildQuery(baseQuery, queryParams, filterConfig, searchConfig, sortConfig) {
        const builder = new QueryBuilder(baseQuery);
        const { query: filteredQuery, params: filteredParams } = builder
            .applyFilters(queryParams, filterConfig)
            .applySearch(queryParams, searchConfig)
            .build(); // Build WHERE part before adding ORDER BY

        // Re-create builder to add sorting and pagination to the filtered query
        const finalBuilder = new QueryBuilder(filteredQuery);
        finalBuilder.params = filteredParams; // Carry over the parameters from filtering and searching
        return finalBuilder
            .applySorting(queryParams, sortConfig)
            .applyPagination(queryParams)
            .build();
    }
}

module.exports = QueryBuilder;