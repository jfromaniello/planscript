# Orientation-Aware House Design
# 
# This example demonstrates site orientation features that help you design
# with solar orientation and street access in mind.
#
# The house faces south (street), so:
# - East = morning sun (ideal for bedrooms)
# - West = afternoon sun (ideal for living areas)
# - North = back/garden (quiet, private)
# - South = street/front (access, visibility)

units m

defaults {
  door_width 0.9
  window_width 1.5
}

# Define site orientation
site {
  street south          # Front of the lot faces south
  hemisphere north      # Northern hemisphere (default)
}

plan "Orientation-Aware House" {
  footprint rect (0, 0) (18, 14)
  
  # === Street Side (South) - Entry and Services ===
  
  # Garage near street for easy access
  room garage {
    rect (0, 0) (6, 6)
    label "Garage"
  }
  
  # Entry/foyer - needs street access
  room entry {
    rect (6, 0) (10, 4)
    label "Entry"
  }
  
  # Laundry - service area, doesn't need premium location
  room laundry {
    rect (10, 0) (14, 4)
    label "Laundry"
  }
  
  # === Living Areas (West/Center) - Afternoon Sun ===
  
  room living {
    rect (0, 6) (10, 14)
    label "Living Room"
  }
  
  room dining {
    rect (10, 8) (14, 14)
    label "Dining"
  }
  
  room kitchen {
    rect (10, 4) (14, 8)
    label "Kitchen"
  }
  
  # === Bedrooms (East) - Morning Sun ===
  
  room master {
    rect (14, 8) (18, 14)
    label "Master"
  }
  
  room bedroom2 {
    rect (14, 4) (18, 8)
    label "Bedroom 2"
  }
  
  room bath {
    rect (14, 0) (18, 4)
    label "Bath"
  }
  
  # === Doors ===
  
  # Exterior entry
  opening door d_front {
    on entry.edge south
    at 50%
    width 1.0
  }
  
  # Interior connections
  opening door d_entry_living { between entry and living on shared_edge at 50% }
  opening door d_living_dining { between living and dining on shared_edge at 50% }
  opening door d_dining_kitchen { between dining and kitchen on shared_edge at 50% }
  opening door d_kitchen_laundry { between kitchen and laundry on shared_edge at 50% }
  opening door d_entry_garage { between entry and garage on shared_edge at 50% }
  opening door d_master_dining { between master and dining on shared_edge at 50% }
  opening door d_bedroom_kitchen { between bedroom2 and kitchen on shared_edge at 50% }
  opening door d_bath_laundry { between bath and laundry on shared_edge at 50% }
  
  # === Windows - Strategic Placement for Light ===
  
  # Living room - afternoon sun (west) + garden view (north)
  opening window w_living_west { on living.edge west at 4.0 width 2.5 }
  opening window w_living_north { on living.edge north at 4.0 width 3.0 }
  
  # Dining - garden view
  opening window w_dining { on dining.edge north at 2.0 width 2.0 }
  
  # Master bedroom - morning sun (east) + garden view
  opening window w_master_east { on master.edge east at 3.0 width 1.8 }
  opening window w_master_north { on master.edge north at 2.0 width 1.5 }
  
  # Bedroom 2 - morning sun
  opening window w_bed2 { on bedroom2.edge east at 2.0 width 1.5 }
  
  # === Orientation Assertions ===
  
  # Bedrooms should have morning sun for natural wake-up
  assert orientation master has_window morning_sun
  assert orientation bedroom2 has_window morning_sun
  
  # Living areas should have afternoon sun and/or garden view
  assert orientation living has_window afternoon_sun
  assert orientation living garden_view
  assert orientation dining garden_view
  
  # Service areas should be near street (don't waste good orientations)
  assert orientation garage near street
  assert orientation entry near street
  assert orientation laundry near street
  
  # Master should have garden view (privacy + nature)
  assert orientation master garden_view
  
  # === Standard Assertions ===
  assert no_overlap rooms
  assert inside footprint all_rooms
  assert min_room_area master >= 15
  assert min_room_area living >= 25
}
