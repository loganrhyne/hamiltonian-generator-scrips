# hamiltonian-generator-scrips


This project is the software half of a design exercise to create a collection of lighting artifacts defined by Hamiltonian Cycles.

The initial exploration is to create a cardboard prototype of a cylindrical lampshade where the central illumination is surrounded by a Hamiltonian Cycle path that fills the surface plane of a cylindrical grid and then is projected inwards to create "walls" so the path has dimensionality perpendicular to the vertical axis of the cylinder.

On the software side we need:

- An algorithm to generate valid Hamiltonian cycles for "even" cylindrical grids
- A representation of paths that we can serialize and save
- A simple way to visualize generated paths to check for correctness
- A way to specify "physical" traits like wall thickess and height to visualize the final object as it would exist after construction

