=====================================================================================
TargetTrack - Generated Data Files:

=====================================================================================
Last file generation: June 30, 2017

These files represented the final data files for the Protein Structure Initiative’s 
TargetTrack structural genomics target database.  This file gives a summary of all of
The data files provided - headings in ALL CAPS match the directories in the Zipped archive
with the addition of a new “TargetsbyContributor” folder, and a “Documentation” folder
With all necessary documentation. 

This Dataset has been assigned DOI: 10.5281/zenodo.821654

=====================================================================================
TargetTrack FASTA Files
=====================================================================================

TARGET SEQUENCES

- targets.fa.gz (formerly targets.fa.gz on TargetDB)

	All target protein sequences found in TargetTrack in FASTA format (using TargetDB header).

	header:
	>'target id' $ 'center initials' $ 'sequence_id' $ 'internal database counter' $ 'target sequence number' $ 

	example:
	>MCSG-APC094 $ MCSG $ SQ18827 $ PDBT39154 $ 1 $ 

=====================================================================================

- proteinTargetSeqs.fasta.gz (formerly pepcTargets.fasta.gz on PepcDB)

	All target protein sequences found in TargetTrack in FASTA format (using PepcDB header).

	header:
	>'target id' $ 'center initials' $ 'source organism' $ 'sequence name' $ 'target sequence number' $

	example:
	>MCSG-APC094 $ MCSG $ Streptococcus pneumoniae $ SP1899msm operon regulatory protein $ 1 $

=====================================================================================

- dnaTargetSeqs.fasta.gz (formerly pepcTargetsDNA.fasta.gz on PepcDB)

	Target DNA sequences and DNA sequences of protein targets found in TargetTrack in FASTA format.
	Please note that DNA sequences are not provided for all protein targets.

	Uses same header as proteinTargetSeqs.fasta.gz.

=====================================================================================

- rnaTargetSeqs.fasta.gz (new to TargetTrack)

	Target RNA sequences found in TargetTrack in FASTA format.

	Uses same header as proteinTargetSeqs.fasta.gz.

=====================================================================================

TRIAL SEQUENCES

- proteinTrialSeqs.fasta.gz (formerly pepcTrialSequences.fasta.gz on PepcDB)

	A complete list of protein sequences of experimental trials found in TargetTrack in FASTA format.

	A protein target can be associated with multiple trials or experiments.
	The trial sequences might be identical to the target sequences or
	represent truncations, mutations, and other sequence modifications
	introduced to achieve the experimental goal of the root protein target.

	header:
	>'target id' $ 'trial id' $ 'center initials' $ 'trial current status' $ 'target sequence number' $

	example:
	>MCSG-APC094 $ 1 $ MCSG $ cloned $ 1 $

=====================================================================================

- dnaTrialSeqs.fasta.gz (new to TargetTrack)

	DNA sequences from experimental trials found in TargetTrack in FASTA format.

	Uses same header as proteinTrialSeqs.fasta.gz.

=====================================================================================

- rnaTrialSeqs.fasta.gz (new to TargetTrack)

	RNA sequences from experimental trials found in TargetTrack in FASTA format.

	Uses same header as proteinTrialSeqs.fasta.gz.

=====================================================================================

PDB STRUCTURE SEQUENCES

- pdb_released.fa.gz

	All distinct released PDB chain sequences in FASTA format.

	header:
	>'pdb id' chain:(chains): mol:(molecule type) length:(sequence length) source:(source organism) name:(structure name)

	example:
	>104l chain:A,B mol:protein length:166 source:enterobacteria phage t4 name:t4 lysozyme

=====================================================================================

- pdb_prereleased.fa.gz

	All distinct prereleased PDB chain sequences in FASTA format.

	header:
	>'pdb id' Entity (unique chain sequence within structure)

	example:
	>4E5I Entity 1


=====================================================================================
TargetTrack CSV Files
=====================================================================================

- targetpdb_info.csv - tab-delimited output of TargetTrack table "targetpdb_info"

	This table represents a list of structures in the PDB that are determined by
	contributing centers and included in their target data file.

	The data is sorted by site (contributing center) and target id.

	PDB data includes PDB ID, method, title, date deposited, date released, and
	pdb status.

	header:
	TargetTrack_id, site, pdb_id, target_id, method, title, date_deposited,
	date_released, pdb_status

	example:
	JCSG-419184	JCSG	4E5V	419184	X-RAY DIFFRACTION	Crystal structure
	of a Putative thua-like protein (PARMER_02418) from Parabacteroides merdae ATCC 43184
	at 1.75 A resolution	2012-03-14	2012-04-04	REL


=====================================================================================
TargetTrack XML Files:
=====================================================================================

- tt.xml.gz

	A complete list of targets and protocols in TargetTrack XML format.

	This file includes all target metadata, including text protocols,
	target and trial sequences, and experiment descriptions.

=====================================================================================

- CENTER_NAME.xml.gz

	Data deposited by each structural biology center in TargetTrack XML format.

	Examples: JCSG.xml.gz, MCSG.xml.gz, NESG.xml.gz, NYSGRC.xml.gz.


=====================================================================================
TargetTrack XML Schema Files:
=====================================================================================

- targetTrack-v1.4.1.xsd

	The current TargetTrack XML schema.

- targetTrack-v1.4.xsd

- targetTrack-v1.3.xsd


=====================================================================================
Legacy Target Files:
=====================================================================================

- targets.xml.gz

	All protein targets found in TargetTrack, formatted to fit the TargetDB
	target.dtd schema (link to download target.dtd is provided).

	The target.dtd schema only allows one sequence per target.
	A target with n sequences will contain n instances in this file.

- targetsV2.xml.gz

	All protein targets found in TargetTrack, formatted to fit the TargetDB
	targetdb.v2.dtd schema (link to download targetdb.v2.dtd is provided).

	The targetdb.V2.dtd schema allows multiple sequences per target.
	Complex targets composed of target references are listed with their
	component sequences.


=====================================================================================
If you have any questions or suggestions please contact:

	target-help@sbkb.org
=====================================================================================
