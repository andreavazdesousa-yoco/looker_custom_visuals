# --------------------------------------------------------------------
# View Configuration
# --------------------------------------------------------------------

view: weekly_business_review {
  label: "WBR Template"

  derived_table: {
    sql: 
    
    with constants as (
      select
        {% parameter number_of_periods %} as n_periods,
        date_sub(current_date(), interval 1 day) as current_cycle_end,
        date_trunc(date_sub(current_date(), interval 1 day), week(monday)) as current_week_start,
        date_trunc(date_sub(current_date(), interval 1 day), month) as current_month_start,
        date_trunc(date_sub(current_date(), interval 1 day), year) as current_year_start
    ),
    years as (
      select
        0 as indicator,
        cast(extract(year from current_year_start) as string) as reference,
        'Year' as type,
        'Current' as cycle,
        current_year_start as start_date,
        current_cycle_end as end_date
      from constants
      union all
      select
        0 as indicator,
        cast(extract(year from current_year_start) as string) as reference,
        'Year' as type,
        'Previous' as cycle,
        date_sub(current_year_start, interval 1 year) as start_date,
        date_sub(current_cycle_end, interval 1 year) as end_date
      from constants
    ),
    months as (
      select
        0 as indicator,
        concat(
          cast(extract(year from current_month_start) as string),
          '-',
          lpad(cast(extract(month from current_month_start) as string),2,'0')
        ) as reference,
        'Month' as type,
        'Current' as cycle,
        current_month_start as start_date,
        current_cycle_end as end_date
      from constants
      union all
      select
        0 as indicator,
        concat(
          cast(extract(year from current_month_start) as string),
          '-',
          lpad(cast(extract(month from current_month_start) as string),2,'0')
        ) as reference,
        'Month' as type,
        'Previous' as cycle,
        date_sub(current_month_start, interval 12 month) as start_date,
        date_sub(current_cycle_end, interval 12 month) as end_date
      from constants
      union all
      select
        row_number() over (order by n) as indicator,
        concat(
          cast(extract(year from date_sub(current_month_start, interval n month)) as string),
          '-',
          lpad(cast(extract(month from date_sub(current_month_start, interval n month)) as string),2,'0')
        ) as reference,
        'Month' as type,
        'Current' as cycle,
        date_sub(current_month_start, interval n month) as start_date,
        date_sub(date_sub(current_month_start, interval (n-1) month), interval 1 day) as end_date
      from constants
      cross join unnest(generate_array(1, n_periods)) as n
      union all
      select
        row_number() over (order by n) as indicator,
        concat(
          cast(extract(year from date_sub(current_month_start, interval n month)) as string),
          '-',
          lpad(cast(extract(month from date_sub(current_month_start, interval n month)) as string),2,'0')
        ) as reference,
        'Month' as type,
        'Previous' as cycle,
        date_sub(date_sub(current_month_start, interval 12 month), interval n month) as start_date,
        date_sub(date_sub(date_sub(current_month_start, interval 12 month), interval (n-1) month), interval 1 day) as end_date
      from constants
      cross join unnest(generate_array(1, n_periods)) as n
    ),
    weeks as (
      select
        0 as indicator,
        concat(
          cast(extract(year from current_week_start) as string),
          '-W',
          lpad(cast(extract(isoweek from current_week_start) as string),2,'0')
        ) as reference,
        'Week' as type,
        'Current' as cycle,
        current_week_start as start_date,
        current_cycle_end as end_date
      from constants
      union all
      select
        0 as indicator,
        concat(
          cast(extract(year from current_week_start) as string),
          '-W',
          lpad(cast(extract(isoweek from current_week_start) as string),2,'0')
        ) as reference,
        'Week' as type,
        'Previous' as cycle,
        date_sub(current_week_start, interval 52 week) as start_date,
        date_sub(current_cycle_end, interval 52 week) as end_date
      from constants
      union all
      select
        row_number() over (order by n) as indicator,
        concat(
          cast(extract(year from date_sub(current_week_start, interval n week)) as string),
          '-W',
          lpad(cast(extract(isoweek from date_sub(current_week_start, interval n week)) as string),2,'0')
        ) as reference,
        'Week' as type,
        'Current' as cycle,
        date_sub(current_week_start, interval n week) as start_date,
        date_add(date_sub(current_week_start, interval n week), interval 6 day) as end_date
      from constants
      cross join unnest(generate_array(1, n_periods)) as n
      union all
      select
        row_number() over (order by n) as indicator,
        concat(
          cast(extract(year from date_sub(current_week_start, interval n week)) as string),
          '-W',
          lpad(cast(extract(isoweek from date_sub(current_week_start, interval n week)) as string),2,'0')
        ) as reference,
        'Week' as type,
        'Previous' as cycle,
        date_sub(date_sub(current_week_start, interval 52 week), interval n week) as start_date,
        date_add(date_sub(date_sub(current_week_start, interval 52 week), interval n week), interval 6 day) as end_date
      from constants
      cross join unnest(generate_array(1, n_periods)) as n
    )
    select
      indicator,
      reference,
      cycle,
      type,
      start_date,
      end_date
    from (
      select * from years
      union all
      select * from months
      union all
      select * from weeks
    )
    
    ;;
  }

  # --------------------------------------------------------------------
  # Parameters:
  # --------------------------------------------------------------------

  parameter: number_of_periods {
    label: "Number of Periods"
    type: number
    default_value: "12" # A suggested default number of periods
  }

  # --------------------------------------------------------------------
  # Dimensions:
  # --------------------------------------------------------------------

  dimension: indicator {
    label: "Indicator (Dimension)"
    type: string
    sql: ${TABLE}.indicator ;;
  }
  
  dimension: reference {
    label: "Reference (Dimension)"
    type: string
    sql: ${TABLE}.reference ;;
  }

  dimension: cycle {
    label: "Cycle (Pivot)"
    type: string
    sql: ${TABLE}.cycle ;;
  }
  
  dimension: type {
    label: "Type (Pivot)"
    type: string
    sql: ${TABLE}.type ;;
  }

  dimension: start_date {
    label: "Start Date"
    type: date
    sql: ${TABLE}.start_date ;;
    hidden: yes
  }

  dimension: end_date {
    label: "End Date"
    type: date
    sql: ${TABLE}.end_date ;;
    hidden: yes
  }

}
