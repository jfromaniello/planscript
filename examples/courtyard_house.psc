# Courtyard House Example
# A U-shaped house with a central patio, demonstrating the courtyard feature.

units m

defaults {
  door_width 0.9
  window_width 1.5
}

plan "Casa con Patio" {
  # Rectangular footprint - the courtyard is an open space within
  footprint rect (0, 0) (20, 30)

  # === South Wing (Entry and Living) ===
  room entry {
    rect (0, 0) (6, 8)
    label "Entry"
  }

  room living {
    rect (6, 0) (14, 8)
    label "Living Room"
  }

  room dining {
    rect (14, 0) (20, 8)
    label "Dining"
  }

  # === West Wing (Kitchen and Service) ===
  room kitchen {
    rect (0, 8) (6, 15)
    label "Kitchen"
  }

  room laundry {
    rect (0, 15) (6, 22)
    label "Laundry"
  }

  # === East Wing (Bedrooms) ===
  room bedroom1 {
    rect (14, 8) (20, 15)
    label "Bedroom 1"
  }

  room bath1 {
    rect (14, 15) (20, 22)
    label "Bath"
  }

  # === North Wing (Master Suite) ===
  room master {
    rect (0, 22) (10, 30)
    label "Master Bedroom"
  }

  room master_bath {
    rect (10, 22) (14, 30)
    label "Master Bath"
  }

  room closet {
    rect (14, 22) (20, 30)
    label "Walk-in Closet"
  }

  # === Central Courtyard (open space in the middle) ===
  courtyard patio {
    rect (6, 8) (14, 22)
    label "Central Patio"
  }

  # === Interior Doors ===
  opening door d_entry_living {
    between entry and living
    on shared_edge
    at 50%
  }

  opening door d_living_dining {
    between living and dining
    on shared_edge
    at 50%
  }

  opening door d_entry_kitchen {
    between entry and kitchen
    on shared_edge
    at 50%
  }

  opening door d_kitchen_laundry {
    between kitchen and laundry
    on shared_edge
    at 50%
  }

  opening door d_dining_bedroom1 {
    between dining and bedroom1
    on shared_edge
    at 50%
  }

  opening door d_bedroom1_bath1 {
    between bedroom1 and bath1
    on shared_edge
    at 50%
  }

  opening door d_master_bath {
    between master and master_bath
    on shared_edge
    at 50%
  }

  opening door d_bath_closet {
    between master_bath and closet
    on shared_edge
    at 50%
  }

  # === Exterior Door ===
  opening door d_front {
    on entry.edge south
    at 50%
    width 1.0
  }

  # === Windows (exterior walls) ===
  opening window w_living { on living.edge south at 4.0 }
  opening window w_dining { on dining.edge east at 4.0 }
  opening window w_master { on master.edge north at 4.0 }
  opening window w_bedroom1 { on bedroom1.edge east at 3.5 }

  # Validation
  assert no_overlap rooms
  assert inside footprint all_rooms
  assert min_room_area master >= 20.0
}
