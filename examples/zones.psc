# Zones Example
#
# This example demonstrates the zone feature in PlanScript.
# Zones allow you to group rooms logically and position them as a unit.
#
# This is a typical house layout with three zones:
# - Access zone: entry, garage
# - Social zone: living, dining, kitchen  
# - Private zone: master suite, secondary bedrooms
#
# Layout (conceptual):
#
#     +------------------+------------------+
#     |     PRIVATE ZONE                    |
#     | +-------+-------+-------+-------+   |
#     | |Master | Bath  | Bed 2 | Bed 3 |   |
#     | +-------+-------+-------+-------+   |
#     +------------------+------------------+
#     |      SOCIAL ZONE                    |
#     | +--------+--------+--------+        |
#     | | Living | Dining | Kitchen|        |
#     | +--------+--------+--------+        |
#     +------------------+------------------+
#     |     ACCESS ZONE                     |
#     | +--------+----------+               |
#     | | Entry  |  Garage  |               |
#     | +--------+----------+               |
#     +-------------------------------------+
#

units m

defaults {
  door_width 0.9
  window_width 1.5
}

plan "House with Zones" {
  footprint rect (0, 0) (20, 22)

  # ============================================
  # ACCESS ZONE - Entry and garage at ground level
  # ============================================
  
  zone access {
    label "Access Zone"
    
    room entry {
      rect (0, 0) (5, 4)
      label "Entry"
    }
    
    room garage {
      rect size (7, 4)
      attach east_of entry
      align bottom
      gap 0
      label "Garage"
    }
  }

  # ============================================
  # SOCIAL ZONE - Living spaces
  # ============================================
  
  zone social {
    label "Social Zone"
    attach north_of access
    align left
    gap 0
    
    room living {
      rect (0, 0) (7, 6)
      label "Living Room"
    }
    
    room dining {
      rect size (5, 6)
      attach east_of living
      align top
      gap 0
      label "Dining Room"
    }
    
    room kitchen {
      rect size (5, 6)
      attach east_of dining
      align top
      gap 0
      label "Kitchen"
    }
  }

  # ============================================
  # PRIVATE ZONE - Bedrooms
  # ============================================
  
  zone private {
    label "Private Zone"
    attach north_of social
    align left
    gap 0
    
    room master {
      rect (0, 0) (6, 5)
      label "Master Bedroom"
    }
    
    room master_bath {
      rect size (3, 5)
      attach east_of master
      align top
      gap 0
      label "Master Bath"
    }
    
    room bedroom2 {
      rect size (4, 5)
      attach east_of master_bath
      align top
      gap 0
      label "Bedroom 2"
    }
    
    room bedroom3 {
      rect size (4, 5)
      attach east_of bedroom2
      align top
      gap 0
      label "Bedroom 3"
    }
  }

  # ============================================
  # DOORS
  # ============================================

  # Access zone doors
  opening door d_front {
    on entry.edge south
    at 50%
    width 1.0
  }

  opening door d_garage {
    on garage.edge south
    at 50%
    width 5.0
  }

  opening door d_entry_garage {
    between entry and garage
    on shared_edge
    at 50%
  }

  # Access to social
  opening door d_entry_living {
    between entry and living
    on shared_edge
    at 50%
    width 1.2
  }

  # Social zone doors
  opening door d_living_dining {
    between living and dining
    on shared_edge
    at 50%
    width 2.0
  }

  opening door d_dining_kitchen {
    between dining and kitchen
    on shared_edge
    at 50%
    width 1.5
  }

  # Social to private
  opening door d_living_master {
    between living and master
    on shared_edge
    at 50%
  }

  # Private zone doors
  opening door d_master_bath {
    between master and master_bath
    on shared_edge
    at 50%
    width 0.8
  }

  opening door d_bath_bed2 {
    between master_bath and bedroom2
    on shared_edge
    at 50%
  }

  opening door d_bed2_bed3 {
    between bedroom2 and bedroom3
    on shared_edge
    at 50%
  }

  # ============================================
  # WINDOWS
  # ============================================

  # Living room
  opening window w_living_w {
    on living.edge west
    at 3.0
    width 2.5
  }

  # Dining room
  opening window w_dining_n {
    on dining.edge north
    at 2.5
    width 2.0
  }

  # Kitchen
  opening window w_kitchen_e {
    on kitchen.edge east
    at 3.0
    width 2.0
  }

  # Master bedroom
  opening window w_master_n {
    on master.edge north
    at 3.0
    width 2.5
  }

  opening window w_master_w {
    on master.edge west
    at 2.5
    width 2.0
  }

  # Bedroom 2
  opening window w_bed2_n {
    on bedroom2.edge north
    at 2.0
    width 1.5
  }

  # Bedroom 3
  opening window w_bed3_n {
    on bedroom3.edge north
    at 2.0
    width 1.5
  }

  opening window w_bed3_e {
    on bedroom3.edge east
    at 2.5
    width 1.5
  }

  # ============================================
  # VALIDATION
  # ============================================

  assert no_overlap rooms
  assert inside footprint all_rooms
  assert min_room_area living >= 35
  assert min_room_area master >= 25
  assert min_room_area bedroom2 >= 15
  assert min_room_area bedroom3 >= 15
}
